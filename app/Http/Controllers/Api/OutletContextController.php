<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutletContextController extends Controller
{
    use EnsuresApiAccess;

    public function allowed(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $allowedOutletIds = $this->allowedOutletIds($user);

        $outlets = Outlet::query()
            ->whereIn('id', $allowedOutletIds)
            ->orderBy('name')
            ->get(['id', 'tenant_id', 'name', 'code', 'timezone']);

        return response()->json([
            'data' => $outlets->map(fn ($outlet): array => [
                'id' => $outlet->id,
                'tenant_id' => $outlet->tenant_id,
                'name' => $outlet->name,
                'code' => $outlet->code,
                'timezone' => $outlet->timezone,
            ])->values(),
        ]);
    }
}
