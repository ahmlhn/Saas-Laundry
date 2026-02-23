<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TenantManagementController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'tenant_manager']);

        $tenant = Tenant::query()
            ->with('currentPlan:id,key,name,orders_limit')
            ->where('id', $user->tenant_id)
            ->first();

        if (! $tenant) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant not found in user scope.',
            ], 404);
        }

        return response()->json([
            'data' => $this->serializeTenant($tenant),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'tenant_manager']);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'status' => ['nullable', 'string', Rule::in(['active', 'inactive'])],
        ]);

        $tenant = Tenant::query()
            ->with('currentPlan:id,key,name,orders_limit')
            ->where('id', $user->tenant_id)
            ->first();

        if (! $tenant) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant not found in user scope.',
            ], 404);
        }

        $nextName = trim((string) $validated['name']);
        if ($nextName === '') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Tenant name is required.',
            ], 422);
        }

        $before = [
            'name' => (string) $tenant->name,
            'status' => (string) $tenant->status,
        ];

        $tenant->name = $nextName;

        if ($request->has('status')) {
            if (! $user->hasRole('owner')) {
                return response()->json([
                    'reason_code' => 'ROLE_ACCESS_DENIED',
                    'message' => 'Only owner can update tenant status.',
                ], 403);
            }

            $tenant->status = (string) ($validated['status'] ?? $tenant->status);
        }

        $tenant->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::TENANT_PROFILE_UPDATED,
            actor: $user,
            tenantId: (string) $tenant->id,
            entityType: 'tenant',
            entityId: (string) $tenant->id,
            metadata: [
                'before' => $before,
                'after' => [
                    'name' => (string) $tenant->name,
                    'status' => (string) $tenant->status,
                ],
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeTenant($tenant->fresh(['currentPlan:id,key,name,orders_limit'])),
        ]);
    }

    private function serializeTenant(Tenant $tenant): array
    {
        $tenantId = (string) $tenant->id;

        return [
            'id' => $tenantId,
            'name' => (string) $tenant->name,
            'status' => (string) $tenant->status,
            'plan' => [
                'key' => $tenant->currentPlan?->key,
                'name' => $tenant->currentPlan?->name,
                'orders_limit' => $tenant->currentPlan?->orders_limit,
            ],
            'stats' => [
                'outlets_total' => Outlet::query()->where('tenant_id', $tenantId)->count(),
                'users_total' => User::query()->where('tenant_id', $tenantId)->count(),
                'users_active' => User::query()->where('tenant_id', $tenantId)->where('status', 'active')->count(),
                'services_total' => Service::query()->where('tenant_id', $tenantId)->count(),
            ],
            'updated_at' => $tenant->updated_at?->toIso8601String(),
        ];
    }
}
