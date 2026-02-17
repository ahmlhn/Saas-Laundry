<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AttachRequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $request->header('X-Request-Id', (string) Str::uuid());
        $request->attributes->set('request_id', $requestId);

        $user = $request->user();

        Log::withContext([
            'request_id' => $requestId,
            'tenant_id' => $user?->tenant_id,
            'user_id' => $user?->id,
            'device_id' => $request->input('device_id'),
            'outlet_id' => $this->resolveOutletId($request),
        ]);

        /** @var Response $response */
        $response = $next($request);
        $response->headers->set('X-Request-Id', $requestId);

        return $response;
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

        $inputOutlet = $request->input('outlet_id') ?? $request->header('X-Outlet-Id');

        if (! is_string($inputOutlet) || $inputOutlet === '') {
            return null;
        }

        return $inputOutlet;
    }
}
