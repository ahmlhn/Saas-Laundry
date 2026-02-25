<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\PlanFeatureDisabledException;
use App\Domain\Billing\PlanFeatureGateService;
use App\Domain\Messaging\Contracts\WaProviderDriver;
use App\Domain\Messaging\WaProviderException;
use App\Domain\Messaging\WaProviderRegistry;
use App\Domain\Messaging\WaTemplateRenderer;
use App\Domain\Messaging\WaTemplateResolver;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WaMessage;
use App\Models\WaProvider;
use App\Models\WaProviderConfig;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WaController extends Controller
{
    public function __construct(
        private readonly PlanFeatureGateService $planFeatureGate,
        private readonly WaProviderRegistry $providerRegistry,
        private readonly WaTemplateResolver $templateResolver,
        private readonly WaTemplateRenderer $templateRenderer,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function providers(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);
        $this->ensureWaFeatureEnabled($user);

        $providers = WaProvider::query()
            ->where('active', true)
            ->orderBy('id')
            ->get(['id', 'key', 'name']);

        $configs = WaProviderConfig::query()
            ->where('tenant_id', $user->tenant_id)
            ->get()
            ->keyBy('provider_id');

        return response()->json([
            'data' => $providers->map(function (WaProvider $provider) use ($configs): array {
                /** @var WaProviderConfig|null $config */
                $config = $configs->get($provider->id);
                $sender = $this->extractSenderFromCredentials($config?->credentials_json);

                return [
                    'id' => $provider->id,
                    'key' => $provider->key,
                    'name' => $provider->name,
                    'configured' => (bool) $config,
                    'is_active' => (bool) ($config?->is_active ?? false),
                    'credentials_set' => ! empty($config?->credentials_json),
                    'sender' => $sender,
                    'updated_at' => $config?->updated_at?->toIso8601String(),
                ];
            })->values(),
        ]);
    }

    public function upsertProviderConfig(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);
        $this->ensureWaFeatureEnabled($user);

        $validated = $request->validate([
            'provider_key' => ['required', 'string', 'max:40'],
            'credentials' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $provider = WaProvider::query()
            ->where('key', $validated['provider_key'])
            ->where('active', true)
            ->first();

        if (! $provider) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Provider is not available.',
            ], 422);
        }

        $existingConfig = WaProviderConfig::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('provider_id', $provider->id)
            ->first();

        $credentials = $this->mergeCredentials($existingConfig?->credentials_json, (array) ($validated['credentials'] ?? []));
        $requestedActive = (bool) ($validated['is_active'] ?? true);

        $driver = $this->providerRegistry->driverForKey($provider->key);
        $health = $this->resolveProviderHealthForUpsert($provider->key, $driver, $credentials);
        $effectiveActive = $requestedActive && ($health['ok'] ?? false);

        $config = DB::transaction(function () use ($user, $provider, $credentials, $effectiveActive): WaProviderConfig {
            if ($effectiveActive) {
                WaProviderConfig::query()
                    ->where('tenant_id', $user->tenant_id)
                    ->where('provider_id', '!=', $provider->id)
                    ->update(['is_active' => false]);
            }

            return WaProviderConfig::query()->updateOrCreate(
                [
                    'tenant_id' => $user->tenant_id,
                    'provider_id' => $provider->id,
                ],
                [
                    'credentials_json' => $credentials,
                    'is_active' => $effectiveActive,
                ]
            );
        });

        $this->auditTrail->record(
            eventKey: AuditEventKeys::WA_PROVIDER_CONFIG_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'wa_provider_config',
            entityId: $config->id,
            metadata: [
                'provider_key' => $provider->key,
                'is_active' => $config->is_active,
                'health_ok' => (bool) ($health['ok'] ?? false),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $config->id,
                'provider_id' => $config->provider_id,
                'provider_key' => $provider->key,
                'is_active' => $config->is_active,
                'credentials_set' => ! empty($config->credentials_json),
                'health' => $health,
            ],
        ]);
    }

    public function templates(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);
        $this->ensureWaFeatureEnabled($user);

        $validated = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
        ]);

        $outletId = $validated['outlet_id'] ?? null;

        if ($outletId) {
            $this->ensureOutletAccess($user, $outletId);
        }

        return response()->json([
            'data' => $this->templateResolver->listResolved($user->tenant_id, $outletId),
        ]);
    }

    public function upsertTemplate(Request $request, string $templateId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);
        $this->ensureWaFeatureEnabled($user);

        $templateId = strtoupper($templateId);

        if (! in_array($templateId, $this->templateResolver->templateIds(), true)) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Unknown template_id.',
            ], 422);
        }

        $validated = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'definition' => ['required', 'array'],
            'definition.required_vars_all' => ['nullable', 'array'],
            'definition.required_vars_any' => ['nullable', 'array'],
            'definition.fallbacks' => ['nullable', 'array'],
            'definition.body_lines' => ['required', 'array', 'min:1'],
            'definition.max_length' => ['nullable', 'integer', 'min:100', 'max:5000'],
        ]);

        $outletId = $validated['outlet_id'] ?? null;

        if ($outletId) {
            $this->ensureOutletAccess($user, $outletId);
        }

        $definition = $validated['definition'];
        $this->templateRenderer->validateDefinition($definition);

        $template = $this->templateResolver->upsertTemplate(
            tenantId: $user->tenant_id,
            outletId: $outletId,
            templateId: $templateId,
            definition: $definition,
        );

        $this->auditTrail->record(
            eventKey: AuditEventKeys::WA_TEMPLATE_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outletId,
            entityType: 'wa_template',
            entityId: $template->id,
            metadata: [
                'template_id' => $templateId,
                'version' => $template->version,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $template->id,
                'template_id' => $template->template_id,
                'version' => $template->version,
                'outlet_id' => $template->outlet_id,
                'definition' => $template->definition_json,
            ],
        ], 201);
    }

    public function messages(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);
        $this->ensureWaFeatureEnabled($user);

        $validated = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'status' => ['nullable', 'in:queued,sent,delivered,failed'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $outletId = $validated['outlet_id'] ?? null;

        if ($outletId) {
            $this->ensureOutletAccess($user, $outletId);
        }

        $query = WaMessage::query()
            ->where('tenant_id', $user->tenant_id)
            ->with('provider:id,key,name')
            ->latest('created_at');

        if ($outletId) {
            $query->where('outlet_id', $outletId);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if (! $isOwner && ! $outletId) {
            $allowedOutletIds = DB::table('user_outlets')
                ->where('user_id', $user->id)
                ->pluck('outlet_id')
                ->toArray();

            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $limit = (int) ($validated['limit'] ?? 30);

        return response()->json([
            'data' => $query->limit($limit)->get(),
        ]);
    }

    /**
     * @param array<int, string> $roles
     */
    private function ensureRole(User $user, array $roles): void
    {
        $hasRole = $user->roles()->whereIn('key', $roles)->exists();

        if ($hasRole) {
            return;
        }

        abort(response()->json([
            'reason_code' => 'ROLE_ACCESS_DENIED',
            'message' => 'You are not allowed to perform this action.',
        ], 403));
    }

    private function ensureWaFeatureEnabled(User $user): void
    {
        $user->loadMissing('tenant.currentPlan:id,key');

        try {
            $this->planFeatureGate->ensureWaEnabledForTenant($user->tenant);
        } catch (PlanFeatureDisabledException) {
            abort(response()->json([
                'reason_code' => 'PLAN_FEATURE_DISABLED',
                'message' => 'WhatsApp feature is available for Premium and Pro plans only.',
            ], 403));
        }
    }

    private function ensureOutletAccess(User $user, string $outletId): void
    {
        if ($user->hasOutletAccess($outletId)) {
            return;
        }

        abort(response()->json([
            'reason_code' => 'OUTLET_ACCESS_DENIED',
            'message' => 'You do not have access to the requested outlet.',
        ], 403));
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
     * @param array<string, mixed>|null $credentials
     */
    private function extractSenderFromCredentials(?array $credentials): ?string
    {
        if (! is_array($credentials)) {
            return null;
        }

        foreach (['sender', 'device', 'device_id'] as $key) {
            $value = $credentials[$key] ?? null;
            if (is_scalar($value)) {
                $trimmed = trim((string) $value);
                if ($trimmed !== '') {
                    return $trimmed;
                }
            }
        }

        return null;
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
                && $this->extractSenderFromCredentials($credentials) !== null;

            if ($isMpwaPartialSetup) {
                return [
                    'ok' => false,
                    'message' => 'Sender tersimpan. Lengkapi api_key dan base_url MPWA untuk mengaktifkan pengiriman.',
                ];
            }

            abort(response()->json([
                'reason_code' => $error->reasonCode,
                'message' => $error->getMessage(),
            ], 422));
        } catch (\Throwable $error) {
            abort(response()->json([
                'reason_code' => 'PROVIDER_HEALTHCHECK_FAILED',
                'message' => $error->getMessage(),
            ], 422));
        }
    }
}
