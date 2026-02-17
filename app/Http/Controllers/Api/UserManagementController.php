<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserManagementController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function destroy(Request $request, string $managedUser): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner']);

        $target = User::withTrashed()
            ->with('roles:id,key')
            ->where('tenant_id', $actor->tenant_id)
            ->where('id', $managedUser)
            ->first();

        if (! $target) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'User not found in tenant scope.',
            ], 404);
        }

        if ($target->id === $actor->id) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'You cannot archive your own account.',
            ], 422);
        }

        if ($target->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'User is already archived.',
            ], 422);
        }

        if ($target->hasRole('owner')) {
            $activeOwnerCount = User::query()
                ->where('tenant_id', $actor->tenant_id)
                ->whereHas('roles', function ($query): void {
                    $query->where('key', 'owner');
                })
                ->count();

            if ($activeOwnerCount <= 1) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Cannot archive the last active owner in tenant.',
                ], 422);
            }
        }

        $target->tokens()->delete();
        $target->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_ARCHIVED,
            actor: $actor,
            tenantId: $actor->tenant_id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'roles' => $target->roles->pluck('key')->values()->all(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $target->id,
                'deleted_at' => $target->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    public function restore(Request $request, string $managedUser): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner']);

        $target = User::withTrashed()
            ->with('roles:id,key')
            ->where('tenant_id', $actor->tenant_id)
            ->where('id', $managedUser)
            ->first();

        if (! $target) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'User not found in tenant scope.',
            ], 404);
        }

        if (! $target->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'User is already active.',
            ], 422);
        }

        $target->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_RESTORED,
            actor: $actor,
            tenantId: $actor->tenant_id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'roles' => $target->roles->pluck('key')->values()->all(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $target->fresh(['roles:id,key,name', 'outlets:id,name,code']),
        ]);
    }
}
