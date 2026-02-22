<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Role;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
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

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'tenant_name' => ['required', 'string', 'max:120'],
            'outlet_name' => ['nullable', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:40'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $normalizedPhone = $this->normalizePhoneForStorage((string) ($validated['phone'] ?? ''));
        $hasPhoneInput = trim((string) ($validated['phone'] ?? '')) !== '';

        if ($hasPhoneInput && $normalizedPhone === null) {
            throw ValidationException::withMessages([
                'phone' => ['Invalid phone number format.'],
            ]);
        }

        if ($normalizedPhone !== null && User::query()->where('phone', $normalizedPhone)->exists()) {
            throw ValidationException::withMessages([
                'phone' => ['Phone number is already registered.'],
            ]);
        }

        $selectedPlan = Plan::query()->where('key', 'free')->first()
            ?? Plan::query()->orderBy('id')->first();

        if (! $selectedPlan) {
            return response()->json([
                'reason_code' => 'APP_CONFIG_INVALID',
                'message' => 'Subscription plans are not configured yet.',
            ], 503);
        }

        $ownerRole = Role::query()->where('key', 'owner')->first();

        if (! $ownerRole) {
            return response()->json([
                'reason_code' => 'APP_CONFIG_INVALID',
                'message' => 'Owner role is not configured yet.',
            ], 503);
        }

        /** @var User $user */
        $user = DB::transaction(function () use ($validated, $normalizedPhone, $selectedPlan, $ownerRole): User {
            $tenant = Tenant::query()->create([
                'name' => trim((string) $validated['tenant_name']),
                'current_plan_id' => $selectedPlan->id,
                'status' => 'active',
            ]);

            $outletName = trim((string) ($validated['outlet_name'] ?? ''));
            if ($outletName === '') {
                $outletName = 'Outlet Utama';
            }

            $outlet = Outlet::query()->create([
                'tenant_id' => $tenant->id,
                'name' => $outletName,
                'code' => $this->generateUniqueOutletCode($tenant->id, $outletName),
                'timezone' => 'Asia/Jakarta',
                'address' => null,
            ]);

            $user = User::query()->create([
                'tenant_id' => $tenant->id,
                'name' => trim((string) $validated['name']),
                'phone' => $normalizedPhone,
                'email' => strtolower(trim((string) $validated['email'])),
                'status' => 'active',
                'password' => (string) $validated['password'],
            ]);

            $user->roles()->sync([$ownerRole->id]);
            $user->outlets()->sync([$outlet->id]);

            $period = now()->format('Y-m');
            TenantSubscription::query()->firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'period' => $period,
                ],
                [
                    'plan_id' => $selectedPlan->id,
                    'starts_at' => now()->startOfMonth(),
                    'ends_at' => now()->endOfMonth(),
                    'status' => 'active',
                ]
            );

            QuotaUsage::query()->firstOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'period' => $period,
                ],
                [
                    'orders_used' => 0,
                ]
            );

            return $user;
        });

        $user->loadMissing(['tenant.currentPlan', 'roles:id,key,name', 'outlets:id,tenant_id,name,code,timezone']);

        $token = $user->createToken($validated['device_name'] ?? 'api-device')->plainTextToken;

        $this->auditTrail->record(
            eventKey: AuditEventKeys::AUTH_REGISTER_SUCCESS,
            actor: $user,
            tenantId: $user->tenant_id,
            metadata: [
                'email' => strtolower((string) $user->email),
                'phone' => (string) ($user->phone ?? ''),
                'tenant_name' => (string) ($user->tenant?->name ?? ''),
                'device_name' => $validated['device_name'] ?? 'api-device',
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'token_type' => 'Bearer',
            'access_token' => $token,
            'data' => $this->buildUserContext($user),
        ], 201);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'login' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'string', 'max:255'],
        ]);

        $loginInput = trim((string) ($validated['login'] ?? $validated['email'] ?? ''));

        if ($loginInput === '') {
            throw ValidationException::withMessages([
                'login' => ['The login field is required.'],
            ]);
        }

        $user = $this->resolveUserByLogin($loginInput);

        if ($user && $user->status === 'active') {
            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            $hash = Hash::make($otp);

            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => strtolower((string) $user->email)],
                [
                    'token' => $hash,
                    'created_at' => now(),
                ]
            );

            $tenantName = (string) ($user->tenant?->name ?? 'Laundry App');
            $recipient = (string) $user->email;
            $expiresMinutes = 30;

            Mail::raw(
                "Kode reset password {$tenantName}: {$otp}. Kode berlaku {$expiresMinutes} menit.",
                static function ($message) use ($recipient, $tenantName): void {
                    $message
                        ->to($recipient)
                        ->subject("[{$tenantName}] Kode Reset Password");
                }
            );

            $this->auditTrail->record(
                eventKey: AuditEventKeys::AUTH_PASSWORD_RESET_REQUESTED,
                actor: $user,
                tenantId: $user->tenant_id,
                metadata: [
                    'email' => strtolower((string) $user->email),
                    'login' => $loginInput,
                ],
                channel: 'api',
                request: $request,
            );
        }

        return response()->json([
            'message' => 'Jika akun ditemukan, kode reset sudah dikirim ke email terdaftar.',
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'login' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'string', 'max:255'],
            'code' => ['required', 'digits:6'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $loginInput = trim((string) ($validated['login'] ?? $validated['email'] ?? ''));
        if ($loginInput === '') {
            throw ValidationException::withMessages([
                'login' => ['The login field is required.'],
            ]);
        }

        $user = $this->resolveUserByLogin($loginInput);
        if (! $user) {
            throw ValidationException::withMessages([
                'code' => ['Kode reset tidak valid atau sudah kedaluwarsa.'],
            ]);
        }

        $tokenRow = DB::table('password_reset_tokens')
            ->where('email', strtolower((string) $user->email))
            ->first();

        if (! $tokenRow || ! is_string($tokenRow->token)) {
            throw ValidationException::withMessages([
                'code' => ['Kode reset tidak valid atau sudah kedaluwarsa.'],
            ]);
        }

        $createdAt = $this->parseTokenCreatedAt($tokenRow->created_at);
        $isExpired = $createdAt->addMinutes(30)->isPast();

        if ($isExpired || ! Hash::check((string) $validated['code'], $tokenRow->token)) {
            throw ValidationException::withMessages([
                'code' => ['Kode reset tidak valid atau sudah kedaluwarsa.'],
            ]);
        }

        $user->forceFill([
            'password' => (string) $validated['password'],
        ])->save();

        DB::table('password_reset_tokens')
            ->where('email', strtolower((string) $user->email))
            ->delete();

        $user->tokens()->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::AUTH_PASSWORD_RESET_COMPLETED,
            actor: $user,
            tenantId: $user->tenant_id,
            metadata: [
                'email' => strtolower((string) $user->email),
                'login' => $loginInput,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'message' => 'Password berhasil direset. Silakan login dengan password baru.',
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

    private function normalizePhoneForStorage(string $input): ?string
    {
        $trimmed = trim($input);

        if ($trimmed === '') {
            return null;
        }

        if (preg_match('/^[0-9+\-\s().]+$/', $trimmed) !== 1) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            return null;
        }

        if (str_starts_with($digits, '0')) {
            $national = ltrim(substr($digits, 1), '0');

            return $national !== '' ? '62'.$national : null;
        }

        if (str_starts_with($digits, '8')) {
            return '62'.$digits;
        }

        if (str_starts_with($digits, '62')) {
            return $digits;
        }

        return $digits;
    }

    private function resolveUserByLogin(string $loginInput): ?User
    {
        $normalizedEmail = $this->normalizeEmail($loginInput);
        $phoneCandidates = $this->buildPhoneCandidates($loginInput);
        $canResolveUser = $normalizedEmail !== null || $phoneCandidates !== [];

        if (! $canResolveUser) {
            return null;
        }

        return User::query()
            ->with(['tenant:id,name'])
            ->where(function ($query) use ($normalizedEmail, $phoneCandidates): void {
                if ($normalizedEmail !== null) {
                    $query->orWhereRaw('LOWER(email) = ?', [$normalizedEmail]);
                }

                if ($phoneCandidates !== []) {
                    $query->orWhereIn('phone', $phoneCandidates);
                }
            })
            ->first();
    }

    private function generateUniqueOutletCode(string $tenantId, string $sourceName): string
    {
        $alphanumeric = preg_replace('/[^A-Za-z0-9]/', '', strtoupper($sourceName)) ?? '';
        $base = substr($alphanumeric !== '' ? $alphanumeric : 'OUTLET', 0, 8);
        $candidate = $base;

        $counter = 1;
        while (
            Outlet::query()
                ->where('tenant_id', $tenantId)
                ->where('code', $candidate)
                ->exists()
        ) {
            $suffix = (string) $counter;
            $maxPrefixLength = max(8 - strlen($suffix), 1);
            $candidate = substr($base, 0, $maxPrefixLength).$suffix;
            $counter++;
        }

        return substr($candidate, 0, 8);
    }

    private function parseTokenCreatedAt(mixed $createdAt): CarbonImmutable
    {
        if ($createdAt instanceof \DateTimeInterface) {
            return CarbonImmutable::instance($createdAt);
        }

        if (is_string($createdAt) && trim($createdAt) !== '') {
            try {
                return CarbonImmutable::parse($createdAt);
            } catch (\Throwable) {
                // fallback to past date so token is considered expired.
            }
        }

        return CarbonImmutable::instance(Date::now())->subDays(1);
    }
}
