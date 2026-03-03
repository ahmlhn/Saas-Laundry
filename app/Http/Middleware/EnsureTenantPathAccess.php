<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantPathAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(401, 'Authentication is required.');
        }

        $tenant = $user->tenant()->first();

        if (! $tenant instanceof Tenant || $user->tenant_id !== $tenant->id) {
            abort(403, 'Tenant access denied.');
        }

        app()->instance(Tenant::class, $tenant);
        $request->attributes->set('tenant', $tenant);

        return $next($request);
    }
}
