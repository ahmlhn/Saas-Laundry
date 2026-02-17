<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\OutletService;
use App\Models\Service;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ServiceCatalogController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function services(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'active' => ['nullable', 'boolean'],
            'outlet_id' => ['nullable', 'uuid'],
            'include_deleted' => ['nullable', 'boolean'],
        ]);

        $outletId = $validated['outlet_id'] ?? null;
        $includeDeleted = (bool) ($validated['include_deleted'] ?? false);

        if ($outletId) {
            $this->ensureOutletAccess($user, $outletId);
        }

        if ($includeDeleted) {
            $this->ensureRole($user, ['owner', 'admin']);
        }

        $query = Service::query()
            ->where('tenant_id', $user->tenant_id)
            ->orderBy('name');

        if ($includeDeleted) {
            $query->withTrashed();
        }

        if (array_key_exists('active', $validated)) {
            $query->where('active', (bool) $validated['active']);
        }

        $services = $query->get();

        $outletOverrides = collect();

        if ($outletId) {
            $outletOverrides = OutletService::query()
                ->where('outlet_id', $outletId)
                ->get()
                ->keyBy('service_id');
        }

        return response()->json([
            'data' => $services->map(function (Service $service) use ($outletOverrides): array {
                /** @var OutletService|null $override */
                $override = $outletOverrides->get($service->id);

                return [
                    'id' => $service->id,
                    'tenant_id' => $service->tenant_id,
                    'name' => $service->name,
                    'unit_type' => $service->unit_type,
                    'base_price_amount' => $service->base_price_amount,
                    'active' => (bool) $service->active,
                    'effective_price_amount' => (int) ($override?->price_override_amount ?? $service->base_price_amount),
                    'outlet_override' => $override ? [
                        'id' => $override->id,
                        'active' => (bool) $override->active,
                        'price_override_amount' => $override->price_override_amount,
                        'sla_override' => $override->sla_override,
                    ] : null,
                ];
            })->values(),
        ]);
    }

    public function destroy(Request $request, Service $service): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($service->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested service.',
            ], 403);
        }

        $service->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_ARCHIVED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service',
            entityId: $service->id,
            metadata: [
                'service_name' => $service->name,
                'unit_type' => $service->unit_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $service->id,
                'deleted_at' => $service->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    public function restore(Request $request, string $serviceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $service = Service::withTrashed()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $serviceId)
            ->first();

        if (! $service) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Service not found in tenant scope.',
            ], 404);
        }

        if (! $service->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Service is already active.',
            ], 422);
        }

        $service->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_RESTORED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service',
            entityId: $service->id,
            metadata: [
                'service_name' => $service->name,
                'unit_type' => $service->unit_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $service->fresh(),
        ]);
    }
}
