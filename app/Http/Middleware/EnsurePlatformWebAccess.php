<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePlatformWebAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Authentication is required.');
        }

        if ($user->tenant_id !== null) {
            abort(403, 'Platform access is only available for global accounts.');
        }

        if (! $user->hasAnyRole(['platform_owner', 'platform_billing'])) {
            abort(403, 'Platform role is required.');
        }

        return $next($request);
    }
}
