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
            'login' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $loginInput = trim((string) ($validated['login'] ?? $validated['email'] ?? ''));
        if ($loginInput === '') {
            throw ValidationException::withMessages([
                'login' => ['The login field is required.'],
            ]);
        }

        $normalizedEmail = $this->normalizeEmail($loginInput);
        $phoneCandidates = $this->buildPhoneCandidates($loginInput);
        $canResolveUser = $normalizedEmail !== null || $phoneCandidates !== [];

        $user = $canResolveUser
            ? User::query()
                ->with(['tenant.currentPlan', 'roles:id,key,name', 'outlets:id,tenant_id,name,code,timezone'])
                ->where(function ($query) use ($normalizedEmail, $phoneCandidates): void {
                    if ($normalizedEmail !== null) {
                        $query->orWhereRaw('LOWER(email) = ?', [$normalizedEmail]);
                    }

                    if ($phoneCandidates !== []) {
                        $query->orWhereIn('phone', $phoneCandidates);
                    }
                })
                ->first()
            : null;

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_FAILED,
                actor: $user,
                tenantId: $user?->tenant_id,
                metadata: [
                    'login' => $loginInput,
                    'email' => $normalizedEmail,
                    'reason' => 'invalid_credentials',
                ],
                channel: 'api',
                request: $request,
            );

            throw ValidationException::withMessages([
                'login' => ['The provided credentials are incorrect.'],
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->status !== 'active') {
            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_LOGIN_INACTIVE,
                actor: $user,
                tenantId: $user->tenant_id,
                metadata: [
                    'login' => $loginInput,
                    'email' => strtolower((string) $user->email),
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
                'login' => $loginInput,
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

    private function normalizeEmail(string $input): ?string
    {
        $normalized = strtolower(trim($input));

        if ($normalized === '' || filter_var($normalized, FILTER_VALIDATE_EMAIL) === false) {
            return null;
        }

        return $normalized;
    }

    /**
     * @return array<int, string>
     */
    private function buildPhoneCandidates(string $input): array
    {
        $trimmed = trim($input);
        if ($trimmed === '' || str_contains($trimmed, '@')) {
            return [];
        }

        if (preg_match('/^[0-9+\-\s().]+$/', $trimmed) !== 1) {
            return [];
        }

        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';
        if ($digits === '') {
            return [];
        }

        $candidates = [$trimmed, $digits];

        if (str_starts_with($digits, '0')) {
            $national = ltrim(substr($digits, 1), '0');
            if ($national !== '') {
                $candidates[] = '62'.$national;
            }
        } elseif (str_starts_with($digits, '8')) {
            $candidates[] = '62'.$digits;
        }

        if (str_starts_with($digits, '62')) {
            $national = ltrim(substr($digits, 2), '0');
            if ($national !== '') {
                $candidates[] = '0'.$national;
                $candidates[] = '8'.$national;
            }
        }

        if (str_starts_with($trimmed, '+')) {
            $candidates[] = '+'.$digits;
        }

        return array_values(array_unique(array_filter(
            $candidates,
            static fn (string $value): bool => $value !== ''
        )));
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
