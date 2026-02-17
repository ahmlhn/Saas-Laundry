<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\OutletService;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OutletServiceController extends Controller
{
    use EnsuresApiAccess;

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'active' => ['nullable', 'boolean'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);

        $query = OutletService::query()
            ->where('outlet_id', $outlet->id)
            ->with('service:id,tenant_id,name,unit_type,base_price_amount,active')
            ->orderBy('created_at');

        if (array_key_exists('active', $validated)) {
            $query->where('active', (bool) $validated['active']);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function update(Request $request, OutletService $outletService): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $outlet = $this->ensureOutletAccess($user, $outletService->outlet_id);

        if ($outletService->service?->tenant_id && $outletService->service->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested outlet service.',
            ], 403);
        }

        $validated = $request->validate([
            'active' => ['nullable', 'boolean'],
            'price_override_amount' => ['nullable', 'integer', 'min:0'],
            'sla_override' => ['nullable', 'string', 'max:100'],
        ]);

        $outletService->fill($validated)->save();

        return response()->json([
            'data' => $outletService->fresh(['service:id,name,unit_type,base_price_amount']),
        ]);
    }
}
