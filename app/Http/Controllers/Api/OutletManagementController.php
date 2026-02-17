<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutletManagementController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function destroy(Request $request, string $outletId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        $outlet = Outlet::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $outletId)
            ->first();

        if (! $outlet) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Outlet not found in tenant scope.',
            ], 404);
        }

        $activeOutletCount = Outlet::query()
            ->where('tenant_id', $user->tenant_id)
            ->count();

        if ($activeOutletCount <= 1) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Cannot archive the last active outlet in tenant.',
            ], 422);
        }

        $outlet->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::OUTLET_ARCHIVED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outlet->id,
            entityType: 'outlet',
            entityId: $outlet->id,
            metadata: [
                'name' => $outlet->name,
                'code' => $outlet->code,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $outlet->id,
                'deleted_at' => $outlet->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    public function restore(Request $request, string $outletId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        $outlet = Outlet::withTrashed()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $outletId)
            ->first();

        if (! $outlet) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Outlet not found in tenant scope.',
            ], 404);
        }

        if (! $outlet->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Outlet is already active.',
            ], 422);
        }

        $outlet->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::OUTLET_RESTORED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outlet->id,
            entityType: 'outlet',
            entityId: $outlet->id,
            metadata: [
                'name' => $outlet->name,
                'code' => $outlet->code,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $outlet->fresh(),
        ]);
    }
}
