<?php

namespace App\Http\Middleware;

use App\Models\Outlet;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class EnsureOutletAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $this->deny();
        }

        $outletId = $this->resolveOutletId($request);

        if (! $outletId) {
            return $next($request);
        }

        $belongsToTenant = Outlet::withTrashed()
            ->whereKey($outletId)
            ->where('tenant_id', $user->tenant_id)
            ->exists();

        if (! $belongsToTenant) {
            return $this->deny();
        }

        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if ($isOwner) {
            return $next($request);
        }

        $hasOutlet = DB::table('user_outlets')
            ->where('user_id', $user->id)
            ->where('outlet_id', $outletId)
            ->exists();

        if (! $hasOutlet) {
            return $this->deny();
        }

        return $next($request);
    }

    private function resolveOutletId(Request $request): ?string
    {
        $routeOrder = $request->route('order');

        if (is_object($routeOrder) && method_exists($routeOrder, 'getAttribute')) {
            $orderOutletId = $routeOrder->getAttribute('outlet_id');

            if (is_string($orderOutletId) && $orderOutletId !== '') {
                return $orderOutletId;
            }
        }

        $routeOutlet = $request->route('outlet') ?? $request->route('outlet_id');

        if (is_object($routeOutlet) && method_exists($routeOutlet, 'getKey')) {
            return (string) $routeOutlet->getKey();
        }

        if (is_string($routeOutlet) && $routeOutlet !== '') {
            return $routeOutlet;
        }

        $inputOutlet = $request->input('outlet_id') ?? $request->query('outlet_id') ?? $request->header('X-Outlet-Id');

        if (! is_string($inputOutlet) || $inputOutlet === '') {
            return null;
        }

        return $inputOutlet;
    }

    private function deny(): Response
    {
        return response()->json([
            'reason_code' => 'OUTLET_ACCESS_DENIED',
            'message' => 'You do not have access to the requested outlet.',
        ], 403);
    }
}
