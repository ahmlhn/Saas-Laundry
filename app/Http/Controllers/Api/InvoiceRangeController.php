<?php

namespace App\Http\Controllers\Api;

use App\Domain\Invoices\InvoiceLeaseService;
use App\Domain\Sync\SyncRejectException;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Outlet;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InvoiceRangeController extends Controller
{
    public function __construct(
        private readonly InvoiceLeaseService $invoiceLeaseService,
    ) {
    }

    public function claim(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'device_id' => ['required', 'uuid'],
            'outlet_id' => ['required', 'uuid'],
            'days' => ['required', 'array', 'min:1'],
            'days.*.date' => ['required', 'date_format:Y-m-d'],
            'days.*.count' => ['required', 'integer', 'min:1', 'max:2000'],
        ]);

        try {
            $device = $this->upsertDevice($user, $validated['device_id']);
            $outlet = $this->assertOutletAccess($user, $validated['outlet_id']);
            $leases = $this->invoiceLeaseService->claimRanges(
                device: $device,
                outlet: $outlet,
                days: $validated['days']
            );
        } catch (SyncRejectException $e) {
            return response()->json([
                'reason_code' => $e->reasonCode,
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'server_time' => now()->toIso8601String(),
            'ranges' => collect($leases)->map(fn ($lease): array => [
                'lease_id' => $lease->lease_id,
                'outlet_id' => $lease->outlet_id,
                'date' => $lease->date->toDateString(),
                'prefix' => $lease->prefix,
                'from' => $lease->from_counter,
                'to' => $lease->to_counter,
                'expires_at' => $lease->expires_at->toIso8601String(),
            ])->values(),
        ]);
    }

    /**
     * @param array<int, string> $roles
     */
    private function ensureRole(User $user, array $roles): void
    {
        $hasRole = $user->roles()->whereIn('key', $roles)->exists();

        if ($hasRole) {
            return;
        }

        abort(response()->json([
            'reason_code' => 'ROLE_ACCESS_DENIED',
            'message' => 'You are not allowed to perform this action.',
        ], 403));
    }

    private function assertOutletAccess(User $user, string $outletId): Outlet
    {
        $outlet = Outlet::query()
            ->where('id', $outletId)
            ->where('tenant_id', $user->tenant_id)
            ->first();

        if (! $outlet) {
            throw new SyncRejectException('OUTLET_ACCESS_DENIED', 'Outlet not found in tenant scope.');
        }

        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if ($isOwner) {
            return $outlet;
        }

        $hasOutlet = DB::table('user_outlets')
            ->where('user_id', $user->id)
            ->where('outlet_id', $outlet->id)
            ->exists();

        if (! $hasOutlet) {
            throw new SyncRejectException('OUTLET_ACCESS_DENIED', 'You do not have access to this outlet.');
        }

        return $outlet;
    }

    private function upsertDevice(User $user, string $deviceId): Device
    {
        $device = Device::query()->find($deviceId);

        if ($device && $device->tenant_id !== $user->tenant_id) {
            throw new SyncRejectException('OUTLET_ACCESS_DENIED', 'Device is bound to another tenant.');
        }

        return Device::query()->updateOrCreate(
            ['id' => $deviceId],
            [
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'last_seen_at' => now(),
            ]
        );
    }
}
