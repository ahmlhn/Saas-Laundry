<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Controller;
use App\Models\QuotaUsage;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $user = User::query()
            ->with(['tenant.currentPlan', 'roles:id,key,name', 'outlets:id,tenant_id,name,code,timezone'])
            ->where('email', $validated['email'])
            ->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_FAILED,
                actor: $user,
                tenantId: $user?->tenant_id,
                metadata: [
                    'email' => strtolower($validated['email']),
                    'reason' => 'invalid_credentials',
                ],
                channel: 'api',
                request: $request,
            );

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->status !== 'active') {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_INACTIVE,
                actor: $user,
                tenantId: $user->tenant_id,
                metadata: [
                    'email' => strtolower($validated['email']),
                    'reason' => 'inactive_account',
                ],
                channel: 'api',
                request: $request,
            );

            return response()->json([
                'reason_code' => 'USER_INACTIVE',
                'message' => 'Your account is inactive.',
            ], 403);
        }

        $token = $user->createToken($validated['device_name'] ?? 'api-device')->plainTextToken;

        $this->auditTrail->record(
            eventKey: AuditEventKeys::AUTH_LOGIN_SUCCESS,
            actor: $user,
            tenantId: $user->tenant_id,
            metadata: [
                'email' => strtolower($user->email),
                'device_name' => $validated['device_name'] ?? 'api-device',
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $token,
            'data' => $this->buildUserContext($user),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        $user?->currentAccessToken()?->delete();

        if ($user) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGOUT,
                actor: $user,
                tenantId: $user->tenant_id,
                metadata: [
                    'email' => strtolower($user->email),
                ],
                channel: 'api',
                request: $request,
            );
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user()->loadMissing(['tenant.currentPlan', 'roles:id,key,name', 'outlets:id,tenant_id,name,code,timezone']);

        return response()->json([
            'data' => $this->buildUserContext($user),
        ]);
    }

    private function buildUserContext(User $user): array
    {
        $period = now()->format('Y-m');
        $quotaUsage = null;

        if ($user->tenant_id) {
            $quotaUsage = QuotaUsage::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('period', $period)
                ->first();
        }

        $planKey = $user->tenant?->currentPlan?->key;
        $ordersLimit = $user->tenant?->currentPlan?->orders_limit;
        $ordersUsed = $quotaUsage?->orders_used ?? 0;
        $ordersRemaining = is_null($ordersLimit) ? null : max($ordersLimit - $ordersUsed, 0);

        return [
            'user' => [
                'id' => $user->id,
                'tenant_id' => $user->tenant_id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'status' => $user->status,
            ],
            'roles' => $user->roles->pluck('key')->values(),
            'allowed_outlets' => $user->outlets->map(fn ($outlet): array => [
                'id' => $outlet->id,
                'tenant_id' => $outlet->tenant_id,
                'name' => $outlet->name,
                'code' => $outlet->code,
                'timezone' => $outlet->timezone,
            ])->values(),
            'plan' => [
                'key' => $planKey,
                'orders_limit' => $ordersLimit,
            ],
            'quota' => [
                'period' => $period,
                'orders_limit' => $ordersLimit,
                'orders_used' => $ordersUsed,
                'orders_remaining' => $ordersRemaining,
                'can_create_order' => is_null($ordersLimit) || $ordersRemaining > 0,
            ],
        ];
    }
}
