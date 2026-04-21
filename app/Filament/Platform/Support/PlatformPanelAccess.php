<?php

namespace App\Filament\Platform\Support;

use App\Models\User;

class PlatformPanelAccess
{
    public static function user(): ?User
    {
        $user = auth()->user();

        return $user instanceof User ? $user : null;
    }

    public static function isPlatformUser(?User $user = null): bool
    {
        $user ??= self::user();

        return $user !== null
            && $user->tenant_id === null
            && $user->status === 'active'
            && $user->hasAnyRole(['platform_owner', 'platform_billing']);
    }

    public static function isPlatformOwner(?User $user = null): bool
    {
        $user ??= self::user();

        return self::isPlatformUser($user) && ($user?->hasRole('platform_owner') ?? false);
    }
}
