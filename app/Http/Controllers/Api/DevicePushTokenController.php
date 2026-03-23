<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DevicePushTokenController extends Controller
{
    use EnsuresApiAccess;

    public function upsert(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier', 'worker', 'courier']);

        $validated = $request->validate([
            'device_id' => ['required', 'uuid'],
            'provider' => ['nullable', 'string', 'in:expo'],
            'push_token' => ['nullable', 'string', 'max:191'],
            'platform' => ['nullable', 'string', 'in:android,ios'],
            'permission_status' => ['nullable', 'string', 'max:30'],
            'enabled' => ['nullable', 'boolean'],
        ]);

        $deviceId = (string) $validated['device_id'];
        $existing = Device::query()->find($deviceId);

        if ($existing && $existing->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DEVICE_TENANT_MISMATCH',
                'message' => 'Device is bound to another tenant.',
            ], 403);
        }

        $pushToken = trim((string) ($validated['push_token'] ?? ''));
        $permissionStatus = isset($validated['permission_status']) ? trim((string) $validated['permission_status']) : null;
        $enabled = (bool) ($validated['enabled'] ?? ($pushToken !== ''));
        $shouldStoreToken = $enabled && $pushToken !== '';
        $now = now();

        if ($shouldStoreToken) {
            Device::query()
                ->where('push_token', $pushToken)
                ->where('id', '!=', $deviceId)
                ->update([
                    'push_provider' => null,
                    'push_platform' => null,
                    'push_token' => null,
                    'push_enabled' => false,
                    'push_token_updated_at' => $now,
                ]);
        }

        $device = Device::query()->updateOrCreate(
            ['id' => $deviceId],
            [
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'last_seen_at' => $now,
                'push_provider' => $shouldStoreToken ? (string) ($validated['provider'] ?? 'expo') : null,
                'push_platform' => $validated['platform'] ?? null,
                'push_token' => $shouldStoreToken ? $pushToken : null,
                'push_permission_status' => $permissionStatus,
                'push_enabled' => $shouldStoreToken,
                'push_token_updated_at' => $now,
            ]
        );

        return response()->json([
            'data' => [
                'device_id' => (string) $device->id,
                'push_enabled' => (bool) $device->push_enabled,
                'push_permission_status' => $device->push_permission_status ? (string) $device->push_permission_status : null,
                'has_push_token' => $device->push_token !== null,
            ],
        ]);
    }
}
