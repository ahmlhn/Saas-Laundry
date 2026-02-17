<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Models\Outlet;
use App\Models\User;
use Illuminate\Support\Facades\DB;

trait EnsuresApiAccess
{
    /**
     * @param array<int, string> $roles
     */
    protected function ensureRole(User $user, array $roles): void
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

    protected function ensureOutletAccess(User $user, string $outletId): Outlet
    {
        $outlet = Outlet::query()
            ->where('id', $outletId)
            ->where('tenant_id', $user->tenant_id)
            ->first();

        if (! $outlet) {
            abort(response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested outlet.',
            ], 403));
        }

        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if ($isOwner) {
            return $outlet;
        }

        $hasOutlet = DB::table('user_outlets')
            ->where('user_id', $user->id)
            ->where('outlet_id', $outlet->id)
            ->exists();

        if (! $hasOutlet) {
            abort(response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested outlet.',
            ], 403));
        }

        return $outlet;
    }

    /**
     * @return array<int, string>
     */
    protected function allowedOutletIds(User $user): array
    {
        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if ($isOwner) {
            return Outlet::query()
                ->where('tenant_id', $user->tenant_id)
                ->pluck('id')
                ->map(fn ($id): string => (string) $id)
                ->all();
        }

        return DB::table('user_outlets')
            ->where('user_id', $user->id)
            ->pluck('outlet_id')
            ->map(fn ($id): string => (string) $id)
            ->all();
    }
}
