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

        $tenant = $request->route('tenant');

        $tenantId = $tenant instanceof Tenant
            ? $tenant->id
            : (is_string($tenant) ? $tenant : null);

        if (! $tenantId || $user->tenant_id !== $tenantId) {
            abort(403, 'Tenant path access denied.');
        }

        return $next($request);
    }
}
