<?php

namespace App\Filament\Support;

use App\Models\Outlet;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

class TenantPanelAccess
{
    public static function user(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }

    public static function tenant(): ?Tenant
    {
        return self::user()?->tenant;
    }

    public static function tenantId(): ?string
    {
        return self::user()?->tenant_id;
    }

    public static function isOwner(?User $user = null): bool
    {
        $user ??= self::user();

        return $user?->hasRole('owner') ?? false;
    }

    /**
     * @return array<int, string>
     */
    public static function allowedOutletIds(?User $user = null): array
    {
        $user ??= self::user();

        if (! $user || ! filled($user->tenant_id)) {
            return [];
        }

        if (self::isOwner($user)) {
            return Outlet::query()
                ->where('tenant_id', $user->tenant_id)
                ->pluck('id')
                ->map(fn ($id): string => (string) $id)
                ->all();
        }

        return $user->outlets()
            ->where('tenant_id', $user->tenant_id)
            ->pluck('outlets.id')
            ->map(fn ($id): string => (string) $id)
            ->all();
    }

    public static function visibleOutletsQuery(?User $user = null): Builder
    {
        $user ??= self::user();

        $query = Outlet::query()
            ->where('tenant_id', $user?->tenant_id)
            ->orderBy('name');

        if ($user && ! self::isOwner($user)) {
            $query->whereIn('id', self::allowedOutletIds($user));
        }

        return $query;
    }

    /**
     * @return array<string, string>
     */
    public static function assignableOutletOptions(?User $user = null): array
    {
        $user ??= self::user();

        return self::visibleOutletsQuery($user)
            ->get(['id', 'code', 'name'])
            ->mapWithKeys(fn (Outlet $outlet): array => [
                (string) $outlet->id => trim(sprintf('%s - %s', $outlet->code, $outlet->name), ' -'),
            ])
            ->all();
    }

    /**
     * @return array<int, string>
     */
    public static function assignableRoleKeys(?User $user = null): array
    {
        $user ??= self::user();

        return self::isOwner($user)
            ? ['tenant_manager', 'admin', 'cashier', 'worker', 'courier']
            : ['cashier', 'worker', 'courier'];
    }

    public static function canManageUser(User $target, ?User $actor = null): bool
    {
        $actor ??= self::user();

        if (! $actor || $actor->tenant_id !== $target->tenant_id) {
            return false;
        }

        if ($actor->id === $target->id) {
            return false;
        }

        if ($target->hasRole('owner')) {
            return false;
        }

        if (self::isOwner($actor)) {
            return true;
        }

        return ! $target->hasRole('admin');
    }
}
