<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\ShippingZone;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShippingZoneController extends Controller
{
    use EnsuresApiAccess;

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'active' => ['nullable', 'boolean'],
        ]);

        $query = ShippingZone::query()
            ->where('tenant_id', $user->tenant_id)
            ->latest('created_at');

        if (! empty($validated['outlet_id'])) {
            $this->ensureOutletAccess($user, $validated['outlet_id']);
            $query->where('outlet_id', $validated['outlet_id']);
        } else {
            $allowedOutletIds = $this->allowedOutletIds($user);
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        if (array_key_exists('active', $validated)) {
            $query->where('active', (bool) $validated['active']);
        }

        return response()->json([
            'data' => $query->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'name' => ['required', 'string', 'max:120'],
            'min_distance_km' => ['nullable', 'numeric', 'min:0'],
            'max_distance_km' => ['nullable', 'numeric', 'min:0'],
            'fee_amount' => ['required', 'integer', 'min:0'],
            'eta_minutes' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);

        $zone = ShippingZone::query()->create([
            'tenant_id' => $user->tenant_id,
            'outlet_id' => $outlet->id,
            'name' => $validated['name'],
            'min_distance_km' => $validated['min_distance_km'] ?? null,
            'max_distance_km' => $validated['max_distance_km'] ?? null,
            'fee_amount' => (int) $validated['fee_amount'],
            'eta_minutes' => $validated['eta_minutes'] ?? null,
            'active' => (bool) ($validated['active'] ?? true),
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'data' => $zone,
        ], 201);
    }
}
