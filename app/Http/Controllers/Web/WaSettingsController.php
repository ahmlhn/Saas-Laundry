<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\PlanFeatureDisabledException;
use App\Domain\Billing\PlanFeatureGateService;
use App\Domain\Messaging\Contracts\WaProviderDriver;
use App\Domain\Messaging\WaProviderException;
use App\Domain\Messaging\WaProviderRegistry;
use App\Filament\Pages\WhatsApp as WhatsAppPage;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WaProvider;
use App\Models\WaProviderConfig;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WaSettingsController extends Controller
{
    use EnsuresWebPanelAccess;

    public function __construct(
        private readonly PlanFeatureGateService $planFeatureGate,
        private readonly WaProviderRegistry $providerRegistry,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureWaEnabled($tenant);

        return redirect(WhatsAppPage::getUrl(panel: 'tenant'));
    }

    public function upsertProviderConfig(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureWaEnabled($tenant);

        $validated = $request->validate([
            'provider_key' => ['required', 'string', 'max:40'],
            'sender' => ['nullable', 'string', 'max:80'],
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

        $incomingCredentials = $this->sanitizeIncomingCredentialsForProvider($provider->key, [
            'sender' => $validated['sender'] ?? null,
        ]);

        $existingConfig = WaProviderConfig::query()
            ->where('tenant_id', $tenant->id)
            ->where('provider_id', $provider->id)
            ->first();

        $credentials = $this->mergeCredentials($existingConfig?->credentials_json, $incomingCredentials);
        $credentials = $this->enforceStoredCredentialPolicy($provider->key, $credentials);
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
     * @param array<string, mixed> $incoming
     * @return array<string, mixed>
     */
    private function sanitizeIncomingCredentialsForProvider(string $providerKey, array $incoming): array
    {
        if (strtolower($providerKey) !== 'mpwa') {
            return $incoming;
        }

        return $this->dropCredentialKeys($incoming, [
            'api_key',
            'token',
            'apikey',
            'base_url',
            'url',
            'send_path',
            'message_path',
            'timeout_seconds',
        ]);
    }

    /**
     * @param array<string, mixed> $credentials
     * @return array<string, mixed>
     */
    private function enforceStoredCredentialPolicy(string $providerKey, array $credentials): array
    {
        if (strtolower($providerKey) !== 'mpwa') {
            return $credentials;
        }

        return $this->dropCredentialKeys($credentials, [
            'api_key',
            'token',
            'apikey',
            'base_url',
            'url',
            'send_path',
            'message_path',
            'timeout_seconds',
        ]);
    }

    /**
     * @param array<string, mixed> $credentials
     * @param array<int, string> $blockedKeys
     * @return array<string, mixed>
     */
    private function dropCredentialKeys(array $credentials, array $blockedKeys): array
    {
        $blocked = [];
        foreach ($blockedKeys as $key) {
            $blocked[strtolower($key)] = true;
        }

        $filtered = [];

        foreach ($credentials as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            if (isset($blocked[strtolower($key)])) {
                continue;
            }

            $filtered[$key] = $value;
        }

        return $filtered;
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
                    'message' => 'Sender tersimpan. Lengkapi MPWA_API_KEY dan MPWA_BASE_URL di .env untuk mengaktifkan pengiriman.',
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
