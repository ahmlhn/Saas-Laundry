<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\PlanFeatureDisabledException;
use App\Domain\Billing\PlanFeatureGateService;
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
            'token' => ['nullable', 'string', 'max:255'],
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

        $credentials = ['token' => $validated['token'] ?? null];

        $this->providerRegistry->driverForKey($provider->key)->healthCheck($credentials);

        DB::transaction(function () use ($tenant, $provider, $credentials, $validated): void {
            $active = (bool) ($validated['is_active'] ?? true);

            if ($active) {
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
                    'is_active' => $active,
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
            ],
            channel: 'web',
            request: $request,
        );

        return back()->with('status', 'Provider config updated.');
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
}
