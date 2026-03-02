<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class UserManagementController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner', 'admin']);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'include_deleted' => ['nullable', 'boolean'],
        ]);

        $query = User::query()
            ->with(['roles:id,key,name', 'outlets:id,name,code'])
            ->where('tenant_id', $actor->tenant_id)
            ->orderBy('name');

        if (! empty($validated['include_deleted'])) {
            $query->withTrashed();
        }

        $search = trim((string) ($validated['q'] ?? ''));

        if ($search !== '') {
            $query->where(function ($innerQuery) use ($search): void {
                $innerQuery
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $limit = (int) ($validated['limit'] ?? 50);
        $users = $query->limit($limit)->get();

        return response()->json([
            'data' => $users->map(fn (User $user): array => $this->formatUserPayload($user))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner', 'admin']);

        $roleOptions = $this->availableRoleOptions($actor);
        $allowedRoleKeys = $roleOptions->pluck('key')->all();

        if ($allowedRoleKeys === []) {
            abort(response()->json([
                'reason_code' => 'ROLE_ACCESS_DENIED',
                'message' => 'No assignable role available for this account.',
            ], 403));
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'phone' => ['nullable', 'string', 'max:40'],
            'password' => ['required', 'string', 'min:8'],
            'status' => ['required', 'string', Rule::in(['active', 'inactive'])],
            'role_key' => ['required', 'string', Rule::in($allowedRoleKeys)],
            'outlet_ids' => ['required', 'array', 'min:1'],
            'outlet_ids.*' => ['required', 'uuid'],
        ]);

        $assignedOutletIds = $this->sanitizeAssignedOutletIds($actor, $validated['outlet_ids']);

        if ($assignedOutletIds === []) {
            $this->validationFailed('Minimal pilih satu outlet untuk user baru.');
        }

        $selectedRole = $roleOptions->firstWhere('key', (string) $validated['role_key']);

        if (! $selectedRole instanceof Role) {
            $this->validationFailed('Role tidak valid untuk akun Anda.');
        }

        $target = User::query()->create([
            'tenant_id' => $actor->tenant_id,
            'name' => (string) $validated['name'],
            'phone' => $validated['phone'] ?? null,
            'email' => (string) $validated['email'],
            'status' => (string) $validated['status'],
            'password' => (string) $validated['password'],
        ]);

        $target->roles()->sync([$selectedRole->id]);
        $target->outlets()->sync($assignedOutletIds);
        $target->load(['roles:id,key,name', 'outlets:id,name,code']);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_INVITED,
            actor: $actor,
            tenantId: $actor->tenant_id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'status' => $target->status,
                'roles' => $target->roles->pluck('key')->values()->all(),
                'outlet_ids' => $target->outlets->pluck('id')->map(fn ($id): string => (string) $id)->values()->all(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->formatUserPayload($target),
        ], 201);
    }

    public function update(Request $request, string $managedUser): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner', 'admin']);

        $target = User::query()
            ->where('tenant_id', $actor->tenant_id)
            ->where('id', $managedUser)
            ->with(['roles:id,key,name', 'outlets:id,name,code'])
            ->first();

        if (! $target) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'User not found in tenant scope.',
            ], 404);
        }

        if (! $this->canManageUserAssignment($actor, $target)) {
            return response()->json([
                'reason_code' => 'ROLE_ACCESS_DENIED',
                'message' => 'You are not allowed to manage this user.',
            ], 403);
        }

        $roleOptions = $this->availableRoleOptions($actor);
        $allowedRoleKeys = $roleOptions->pluck('key')->all();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($target->id)],
            'phone' => ['nullable', 'string', 'max:40'],
            'password' => ['nullable', 'string', 'min:8'],
            'status' => ['required', 'string', Rule::in(['active', 'inactive'])],
            'role_key' => ['required', 'string', Rule::in($allowedRoleKeys)],
            'outlet_ids' => ['required', 'array', 'min:1'],
            'outlet_ids.*' => ['required', 'uuid'],
        ]);

        $assignedOutletIds = $this->sanitizeAssignedOutletIds($actor, $validated['outlet_ids']);

        if ($assignedOutletIds === []) {
            $this->validationFailed('Minimal pilih satu outlet untuk assignment user.');
        }

        $selectedRole = $roleOptions->firstWhere('key', (string) $validated['role_key']);

        if (! $selectedRole instanceof Role) {
            $this->validationFailed('Role tidak valid untuk akun Anda.');
        }

        $before = [
            'name' => $target->name,
            'email' => $target->email,
            'phone' => $target->phone,
            'status' => $target->status,
            'roles' => $target->roles->pluck('key')->values()->all(),
            'outlet_ids' => $target->outlets->pluck('id')->map(fn ($id): string => (string) $id)->values()->all(),
        ];

        $attributes = [
            'name' => (string) $validated['name'],
            'email' => (string) $validated['email'],
            'phone' => $validated['phone'] ?? null,
            'status' => (string) $validated['status'],
        ];

        if (! empty($validated['password'])) {
            $attributes['password'] = (string) $validated['password'];
        }

        $target->forceFill($attributes)->save();

        $target->roles()->sync([$selectedRole->id]);
        $target->outlets()->sync($assignedOutletIds);
        $target->load(['roles:id,key,name', 'outlets:id,name,code']);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_ASSIGNMENT_UPDATED,
            actor: $actor,
            tenantId: $actor->tenant_id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'before' => $before,
                'after' => [
                    'name' => $target->name,
                    'email' => $target->email,
                    'phone' => $target->phone,
                    'status' => $target->status,
                    'roles' => $target->roles->pluck('key')->values()->all(),
                    'outlet_ids' => $target->outlets->pluck('id')->map(fn ($id): string => (string) $id)->values()->all(),
                ],
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->formatUserPayload($target),
        ]);
    }

    public function destroy(Request $request, string $managedUser): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner']);

        $target = User::withTrashed()
            ->with('roles:id,key')
            ->where('tenant_id', $actor->tenant_id)
            ->where('id', $managedUser)
            ->first();

        if (! $target) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'User not found in tenant scope.',
            ], 404);
        }

        if ($target->id === $actor->id) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'You cannot archive your own account.',
            ], 422);
        }

        if ($target->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'User is already archived.',
            ], 422);
        }

        if ($target->hasRole('owner')) {
            $activeOwnerCount = User::query()
                ->where('tenant_id', $actor->tenant_id)
                ->whereHas('roles', function ($query): void {
                    $query->where('key', 'owner');
                })
                ->count();

            if ($activeOwnerCount <= 1) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Cannot archive the last active owner in tenant.',
                ], 422);
            }
        }

        $target->tokens()->delete();
        $target->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_ARCHIVED,
            actor: $actor,
            tenantId: $actor->tenant_id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'roles' => $target->roles->pluck('key')->values()->all(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $target->id,
                'deleted_at' => $target->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    public function restore(Request $request, string $managedUser): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureRole($actor, ['owner']);

        $target = User::withTrashed()
            ->with('roles:id,key')
            ->where('tenant_id', $actor->tenant_id)
            ->where('id', $managedUser)
            ->first();

        if (! $target) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'User not found in tenant scope.',
            ], 404);
        }

        if (! $target->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'User is already active.',
            ], 422);
        }

        $target->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_RESTORED,
            actor: $actor,
            tenantId: $actor->tenant_id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'roles' => $target->roles->pluck('key')->values()->all(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $target->fresh(['roles:id,key,name', 'outlets:id,name,code']),
        ]);
    }

    private function formatUserPayload(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'tenant_id' => (string) $user->tenant_id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status,
            'deleted_at' => $user->deleted_at?->toIso8601String(),
            'roles' => $user->roles->map(fn ($role): array => [
                'id' => (string) $role->id,
                'key' => (string) $role->key,
                'name' => (string) $role->name,
            ])->values(),
            'outlets' => $user->outlets->map(fn ($outlet): array => [
                'id' => (string) $outlet->id,
                'name' => (string) $outlet->name,
                'code' => (string) $outlet->code,
            ])->values(),
        ];
    }

    private function isOwner(User $actor): bool
    {
        return $actor->hasRole('owner');
    }

    private function assignableOutlets(User $actor): Collection
    {
        $query = Outlet::query()
            ->where('tenant_id', $actor->tenant_id)
            ->orderBy('name');

        if (! $this->isOwner($actor)) {
            $query->whereIn('id', $this->allowedOutletIds($actor));
        }

        return $query->get(['id', 'name', 'code']);
    }

    private function availableRoleOptions(User $actor): Collection
    {
        $orderedKeys = $this->isOwner($actor)
            ? ['tenant_manager', 'admin', 'cashier', 'worker', 'courier']
            : ['cashier', 'worker', 'courier'];

        $rows = Role::query()
            ->whereIn('key', $orderedKeys)
            ->get(['id', 'key', 'name'])
            ->keyBy('key');

        return collect($orderedKeys)
            ->map(fn (string $key) => $rows->get($key))
            ->filter()
            ->values();
    }

    /**
     * @param array<int, string> $outletIds
     * @return array<int, string>
     */
    private function sanitizeAssignedOutletIds(User $actor, array $outletIds): array
    {
        $selectedOutletIds = collect($outletIds)
            ->filter(fn ($value): bool => is_string($value) && trim($value) !== '')
            ->map(fn (string $id): string => (string) $id)
            ->values()
            ->unique()
            ->all();

        if ($selectedOutletIds === []) {
            return [];
        }

        $allowedOutletIds = $this->assignableOutlets($actor)
            ->pluck('id')
            ->map(fn ($id): string => (string) $id)
            ->all();

        $invalidOutletIds = array_diff($selectedOutletIds, $allowedOutletIds);

        if ($invalidOutletIds !== []) {
            $this->validationFailed('Ada outlet assignment di luar scope Anda.');
        }

        return $selectedOutletIds;
    }

    private function canManageUserAssignment(User $actor, User $target): bool
    {
        if ($actor->id === $target->id) {
            return false;
        }

        if ($target->hasRole('owner')) {
            return false;
        }

        if ($this->isOwner($actor)) {
            return true;
        }

        return ! $target->hasRole('admin');
    }

    private function validationFailed(string $message): never
    {
        abort(response()->json([
            'reason_code' => 'VALIDATION_FAILED',
            'message' => $message,
        ], 422));
    }
}
