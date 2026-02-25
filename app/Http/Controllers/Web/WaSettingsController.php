<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\PlanFeatureDisabledException;
use App\Domain\Billing\PlanFeatureGateService;
use App\Domain\Messaging\Contracts\WaProviderDriver;
use App\Domain\Messaging\WaProviderException;
use App\Domain\Messaging\WaProviderRegistry;
use App\Domain\Messaging\WaTemplateResolver;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Outlet;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WaMessage;
use App\Models\WaProvider;
use App\Models\WaProviderConfig;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\View\View;

class WaSettingsController extends Controller
{
    use EnsuresWebPanelAccess;

    public function __construct(
        private readonly PlanFeatureGateService $planFeatureGate,
        private readonly WaProviderRegistry $providerRegistry,
        private readonly WaTemplateResolver $templateResolver,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureWaEnabled($tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $providers = WaProvider::query()->where('active', true)->orderBy('id')->get();

        $configs = WaProviderConfig::query()
            ->where('tenant_id', $tenant->id)
            ->get()
            ->keyBy('provider_id');

        $outletsQuery = Outlet::query()->where('tenant_id', $tenant->id)->orderBy('name');

        if (! $ownerMode) {
            $outletsQuery->whereIn('id', $allowedOutletIds);
        }

        $outlets = $outletsQuery->get(['id', 'name', 'code']);

        $selectedOutletId = $request->query('outlet_id');

        $messagesQuery = WaMessage::query()->where('tenant_id', $tenant->id);

        if ($selectedOutletId) {
            $messagesQuery->where('outlet_id', $selectedOutletId);
        } elseif (! $ownerMode) {
            $messagesQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        $messageSummary = [
            'total' => (clone $messagesQuery)->count(),
            'queued' => (clone $messagesQuery)->where('status', 'queued')->count(),
            'sent' => (clone $messagesQuery)->whereIn('status', ['sent', 'delivered'])->count(),
            'failed' => (clone $messagesQuery)->where('status', 'failed')->count(),
            'last_sent_at' => (clone $messagesQuery)
                ->whereIn('status', ['sent', 'delivered'])
                ->max('updated_at'),
        ];

        $messageSummary['failure_rate'] = $messageSummary['total'] > 0
            ? (int) round(($messageSummary['failed'] / $messageSummary['total']) * 100)
            : 0;

        $messages = (clone $messagesQuery)
            ->latest('created_at')
            ->limit(50)
            ->get();

        $templateRows = $this->templateResolver->listResolved(
            tenantId: $tenant->id,
            outletId: is_string($selectedOutletId) && $selectedOutletId !== '' ? $selectedOutletId : null,
        );

        $providerSummary = [
            'configured_count' => $configs->count(),
            'active_count' => $configs->where('is_active', true)->count(),
            'active_provider_key' => optional($configs->firstWhere('is_active', true)?->provider)->key,
        ];

        $templateSummary = [
            'total' => count($templateRows),
            'default_count' => collect($templateRows)->where('source', 'default')->count(),
            'override_count' => collect($templateRows)->where('source', '!=', 'default')->count(),
        ];

        return view('web.wa.index', [
            'tenant' => $tenant,
            'user' => $user,
            'providers' => $providers,
            'configs' => $configs,
            'messages' => $messages,
            'outlets' => $outlets,
            'selectedOutletId' => $selectedOutletId,
            'templateRows' => $templateRows,
            'messageSummary' => $messageSummary,
            'providerSummary' => $providerSummary,
            'templateSummary' => $templateSummary,
        ]);
    }

    public function upsertProviderConfig(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureWaEnabled($tenant);

        $validated = $request->validate([
            'provider_key' => ['required', 'string', 'max:40'],
            'api_key' => ['nullable', 'string', 'max:255'],
            'token' => ['nullable', 'string', 'max:255'],
            'sender' => ['nullable', 'string', 'max:80'],
            'base_url' => ['nullable', 'url', 'max:255'],
            'send_path' => ['nullable', 'string', 'max:80'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $provider = WaProvider::query()
            ->where('key', $validated['provider_key'])
            ->where('active', true)
            ->first();

        if (! $provider) {
            return back()->withErrors([
                'provider_key' => 'Provider is not available.',
            ]);
        }

        $apiKey = $validated['api_key'] ?? $validated['token'] ?? null;
        $incomingCredentials = [
            'api_key' => $apiKey,
            'token' => $apiKey,
            'sender' => $validated['sender'] ?? null,
            'base_url' => $validated['base_url'] ?? null,
            'send_path' => $validated['send_path'] ?? null,
        ];

        $existingConfig = WaProviderConfig::query()
            ->where('tenant_id', $tenant->id)
            ->where('provider_id', $provider->id)
            ->first();

        $credentials = $this->mergeCredentials($existingConfig?->credentials_json, $incomingCredentials);
        $requestedActive = (bool) ($validated['is_active'] ?? true);
        $driver = $this->providerRegistry->driverForKey($provider->key);
        try {
            $health = $this->resolveProviderHealthForUpsert($provider->key, $driver, $credentials);
        } catch (WaProviderException $error) {
            return back()->withErrors([
                'provider_key' => $error->getMessage(),
            ]);
        }
        $effectiveActive = $requestedActive && ($health['ok'] ?? false);

        DB::transaction(function () use ($tenant, $provider, $credentials, $effectiveActive): void {
            if ($effectiveActive) {
                WaProviderConfig::query()
                    ->where('tenant_id', $tenant->id)
                    ->where('provider_id', '!=', $provider->id)
                    ->update(['is_active' => false]);
            }

            WaProviderConfig::query()->updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'provider_id' => $provider->id,
                ],
                [
                    'credentials_json' => $credentials,
                    'is_active' => $effectiveActive,
                ],
            );
        });

        $config = WaProviderConfig::query()
            ->where('tenant_id', $tenant->id)
            ->where('provider_id', $provider->id)
            ->first();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::WA_PROVIDER_CONFIG_UPDATED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'wa_provider_config',
            entityId: $config?->id,
            metadata: [
                'provider_key' => $provider->key,
                'is_active' => (bool) ($config?->is_active ?? false),
                'health_ok' => (bool) ($health['ok'] ?? false),
            ],
            channel: 'web',
            request: $request,
        );

        $statusMessage = (bool) ($health['ok'] ?? false)
            ? 'Provider config updated.'
            : ((string) ($health['message'] ?? 'Provider config saved as inactive.'));

        return back()->with('status', $statusMessage);
    }

    private function ensureWaEnabled(Tenant $tenant): void
    {
        $tenant->loadMissing('currentPlan:id,key,orders_limit');

        try {
            $this->planFeatureGate->ensureWaEnabledForTenant($tenant);
        } catch (PlanFeatureDisabledException) {
            abort(403, 'WhatsApp feature is available for Premium/Pro only.');
        }
    }

    /**
     * @param array<string, mixed>|null $existing
     * @param array<string, mixed> $incoming
     * @return array<string, mixed>
     */
    private function mergeCredentials(?array $existing, array $incoming): array
    {
        $base = is_array($existing) ? $existing : [];
        $normalizedIncoming = [];

        foreach ($incoming as $key => $value) {
            if (! is_string($key) || trim($key) === '') {
                continue;
            }

            if (is_string($value)) {
                $trimmed = trim($value);
                if ($trimmed === '') {
                    continue;
                }
                $normalizedIncoming[$key] = $trimmed;
                continue;
            }

            if (is_bool($value) || is_int($value) || is_float($value)) {
                $normalizedIncoming[$key] = $value;
                continue;
            }

            if (is_array($value) && $value !== []) {
                $normalizedIncoming[$key] = $value;
            }
        }

        return array_merge($base, $normalizedIncoming);
    }

    /**
     * @param array<string, mixed> $credentials
     * @return array{ok: bool, message: string}
     */
    private function resolveProviderHealthForUpsert(string $providerKey, WaProviderDriver $driver, array $credentials): array
    {
        try {
            return $driver->healthCheck($credentials);
        } catch (WaProviderException $error) {
            $isMpwaPartialSetup = strtolower($providerKey) === 'mpwa'
                && $error->reasonCode === 'CREDENTIALS_INVALID'
                && $this->hasSenderCredential($credentials);

            if ($isMpwaPartialSetup) {
                return [
                    'ok' => false,
                    'message' => 'Sender tersimpan. Lengkapi api_key dan base_url MPWA untuk mengaktifkan pengiriman.',
                ];
            }

            throw $error;
        }
    }

    /**
     * @param array<string, mixed> $credentials
     */
    private function hasSenderCredential(array $credentials): bool
    {
        foreach (['sender', 'device', 'device_id'] as $key) {
            $value = $credentials[$key] ?? null;
            if (is_scalar($value) && trim((string) $value) !== '') {
                return true;
            }
        }

        return false;
    }
}
