<?php

namespace App\Http\Controllers\Web\Concerns;

use App\Models\Outlet;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;

trait EnsuresWebPanelAccess
{
    protected function ensurePanelAccess(User $user, Tenant $tenant): void
    {
        if ($user->tenant_id !== $tenant->id) {
            abort(403, 'Tenant access denied.');
        }

        if (! $user->hasAnyRole(['owner', 'admin'])) {
            abort(403, 'Only owner/admin can access web panel.');
        }
    }

    protected function isOwner(User $user): bool
    {
        return $user->roles()->where('key', 'owner')->exists();
    }

    /**
     * @return array<int, string>
     */
    protected function allowedOutletIds(User $user, string $tenantId): array
    {
        if ($this->isOwner($user)) {
            return Outlet::query()
                ->where('tenant_id', $tenantId)
                ->pluck('id')
                ->map(fn ($id): string => (string) $id)
                ->all();
        }

        return DB::table('user_outlets')
            ->join('outlets', 'outlets.id', '=', 'user_outlets.outlet_id')
            ->where('user_outlets.user_id', $user->id)
            ->where('outlets.tenant_id', $tenantId)
            ->pluck('outlets.id')
            ->map(fn ($id): string => (string) $id)
            ->all();
    }
}
