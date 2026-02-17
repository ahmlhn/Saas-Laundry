<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Customer;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Role;
use App\Models\Service;
use App\Models\ShippingZone;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class ManagementController extends Controller
{
    use EnsuresWebPanelAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function users(Tenant $tenant): View
    {
        /** @var User $user */
        $user = auth()->user();
        $this->ensurePanelAccess($user, $tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);
        $assignableOutlets = $this->assignableOutlets($user, $tenant);
        $roleOptions = $this->availableRoleOptions($user);

        $rowsQuery = User::query()
            ->where('tenant_id', $tenant->id)
            ->with(['roles:id,key,name', 'outlets:id,name,code'])
            ->orderBy('name');

        if (! $ownerMode) {
            $rowsQuery->whereHas('outlets', fn ($q) => $q->whereIn('outlets.id', $allowedOutletIds));
        }

        $rows = $rowsQuery->get();

        $manageableUserIds = $rows
            ->filter(fn (User $managed): bool => $this->canManageUserAssignment($user, $managed))
            ->pluck('id')
            ->map(fn ($id): string => (string) $id)
            ->values()
            ->all();

        $archivedRows = collect();

        if ($ownerMode) {
            $archivedRows = User::withTrashed()
                ->onlyTrashed()
                ->where('tenant_id', $tenant->id)
                ->with(['roles:id,key,name', 'outlets:id,name,code'])
                ->orderByDesc('deleted_at')
                ->get();
        }

        return view('web.management.users', [
            'tenant' => $tenant,
            'user' => $user,
            'rows' => $rows,
            'archivedRows' => $archivedRows,
            'ownerMode' => $ownerMode,
            'assignableOutlets' => $assignableOutlets,
            'roleOptions' => $roleOptions,
            'manageableUserIds' => $manageableUserIds,
        ]);
    }

    public function storeUser(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $roleOptions = $this->availableRoleOptions($actor);
        $allowedRoleKeys = $roleOptions->pluck('key')->all();

        if ($allowedRoleKeys === []) {
            abort(403, 'No assignable role available.');
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

        $assignedOutletIds = $this->sanitizeAssignedOutletIds($actor, $tenant, $validated['outlet_ids']);

        if ($assignedOutletIds === []) {
            $this->failUserManagementValidation('Minimal pilih satu outlet untuk user baru.');
        }

        $selectedRole = $roleOptions->firstWhere('key', (string) $validated['role_key']);

        if (! $selectedRole) {
            $this->failUserManagementValidation('Role tidak valid untuk akun Anda.');
        }

        $target = User::query()->create([
            'tenant_id' => $tenant->id,
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
            tenantId: $tenant->id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'status' => $target->status,
                'roles' => $target->roles->pluck('key')->values()->all(),
                'outlet_ids' => $target->outlets->pluck('id')->map(fn ($id): string => (string) $id)->values()->all(),
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.users.index', ['tenant' => $tenant->id])
            ->with('status', 'User baru berhasil dibuat.');
    }

    public function updateUserAssignment(Request $request, Tenant $tenant, string $managedUser): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $managedUser)
            ->with(['roles:id,key,name', 'outlets:id,name,code'])
            ->first();

        if (! $target) {
            abort(404, 'User not found in tenant scope.');
        }

        if (! $this->canManageUserAssignment($actor, $target)) {
            abort(403, 'You are not allowed to manage this user.');
        }

        $roleOptions = $this->availableRoleOptions($actor);
        $allowedRoleKeys = $roleOptions->pluck('key')->all();

        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(['active', 'inactive'])],
            'role_key' => ['required', 'string', Rule::in($allowedRoleKeys)],
            'outlet_ids' => ['required', 'array', 'min:1'],
            'outlet_ids.*' => ['required', 'uuid'],
        ]);

        $assignedOutletIds = $this->sanitizeAssignedOutletIds($actor, $tenant, $validated['outlet_ids']);

        if ($assignedOutletIds === []) {
            $this->failUserManagementValidation('Minimal pilih satu outlet untuk assignment user.');
        }

        $selectedRole = $roleOptions->firstWhere('key', (string) $validated['role_key']);

        if (! $selectedRole) {
            $this->failUserManagementValidation('Role tidak valid untuk akun Anda.');
        }

        $before = [
            'status' => $target->status,
            'roles' => $target->roles->pluck('key')->values()->all(),
            'outlet_ids' => $target->outlets->pluck('id')->map(fn ($id): string => (string) $id)->values()->all(),
        ];

        $target->forceFill([
            'status' => (string) $validated['status'],
        ])->save();
        $target->roles()->sync([$selectedRole->id]);
        $target->outlets()->sync($assignedOutletIds);
        $target->load(['roles:id,key,name', 'outlets:id,name,code']);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_ASSIGNMENT_UPDATED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'before' => $before,
                'after' => [
                    'status' => $target->status,
                    'roles' => $target->roles->pluck('key')->values()->all(),
                    'outlet_ids' => $target->outlets->pluck('id')->map(fn ($id): string => (string) $id)->values()->all(),
                ],
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.users.index', ['tenant' => $tenant->id])
            ->with('status', 'Assignment user berhasil diperbarui.');
    }

    public function customers(Tenant $tenant): View
    {
        /** @var User $user */
        $user = auth()->user();
        $this->ensurePanelAccess($user, $tenant);

        $rows = Customer::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get();

        $archivedRows = Customer::withTrashed()
            ->onlyTrashed()
            ->where('tenant_id', $tenant->id)
            ->orderByDesc('deleted_at')
            ->get();

        return view('web.management.customers', [
            'tenant' => $tenant,
            'user' => $user,
            'rows' => $rows,
            'archivedRows' => $archivedRows,
        ]);
    }

    public function services(Tenant $tenant): View
    {
        /** @var User $user */
        $user = auth()->user();
        $this->ensurePanelAccess($user, $tenant);

        $rows = Service::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get();

        $archivedRows = Service::withTrashed()
            ->onlyTrashed()
            ->where('tenant_id', $tenant->id)
            ->orderByDesc('deleted_at')
            ->get();

        return view('web.management.services', [
            'tenant' => $tenant,
            'user' => $user,
            'rows' => $rows,
            'archivedRows' => $archivedRows,
        ]);
    }

    public function outlets(Tenant $tenant): View
    {
        /** @var User $user */
        $user = auth()->user();
        $this->ensurePanelAccess($user, $tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->withCount([
                'orders',
                'orders as orders_this_month_count' => function ($q): void {
                    $q->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()]);
                },
            ])
            ->orderBy('name');

        if (! $ownerMode) {
            $query->whereIn('id', $allowedOutletIds);
        }

        $rows = $query->get();

        $archivedRows = collect();

        if ($ownerMode) {
            $archivedRows = Outlet::withTrashed()
                ->onlyTrashed()
                ->where('tenant_id', $tenant->id)
                ->orderByDesc('deleted_at')
                ->get();
        }

        return view('web.management.outlets', [
            'tenant' => $tenant,
            'user' => $user,
            'rows' => $rows,
            'archivedRows' => $archivedRows,
            'ownerMode' => $ownerMode,
        ]);
    }

    public function outletServices(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $filters = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'active' => ['nullable', 'boolean'],
            'service_active' => ['nullable', 'boolean'],
            'override_price' => ['nullable', 'string', Rule::in(['has', 'none'])],
            'search' => ['nullable', 'string', 'max:80'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $outletsQuery = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name');

        if (! $ownerMode) {
            $outletsQuery->whereIn('id', $allowedOutletIds);
        }

        $outlets = $outletsQuery->get(['id', 'name', 'code']);

        $services = Service::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get(['id', 'name', 'unit_type', 'base_price_amount', 'active']);

        $query = OutletService::query()
            ->with([
                'outlet:id,name,code,tenant_id',
                'service:id,tenant_id,name,unit_type,base_price_amount,active',
            ])
            ->whereHas('outlet', fn ($q) => $q->where('tenant_id', $tenant->id))
            ->whereHas('service', fn ($q) => $q->where('tenant_id', $tenant->id))
            ->latest('created_at');

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        if (! empty($filters['outlet_id'])) {
            $query->where('outlet_id', $filters['outlet_id']);
        }

        if (array_key_exists('active', $filters)) {
            $query->where('active', (bool) $filters['active']);
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->whereHas('service', fn ($q) => $q->where('name', 'like', "%{$search}%"));
        }

        if (array_key_exists('service_active', $filters)) {
            $query->whereHas('service', fn ($q) => $q->where('active', (bool) $filters['service_active']));
        }

        if (($filters['override_price'] ?? null) === 'has') {
            $query->whereNotNull('price_override_amount');
        }

        if (($filters['override_price'] ?? null) === 'none') {
            $query->whereNull('price_override_amount');
        }

        $rows = $query->get();

        return view('web.management.outlet-services', [
            'tenant' => $tenant,
            'user' => $user,
            'ownerMode' => $ownerMode,
            'filters' => $filters,
            'outlets' => $outlets,
            'services' => $services,
            'rows' => $rows,
            'activeRows' => $rows->where('active', true)->values(),
            'inactiveRows' => $rows->where('active', false)->values(),
        ]);
    }

    public function upsertOutletService(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'service_id' => ['required', 'uuid'],
            'active' => ['nullable', 'boolean'],
            'price_override_amount' => ['nullable', 'integer', 'min:0'],
            'sla_override' => ['nullable', 'string', 'max:100'],
        ]);

        $outlet = $this->findOutletInScope($actor, $tenant, (string) $validated['outlet_id']);

        if (! $outlet) {
            $this->failOutletServiceValidation('Outlet tidak ditemukan atau di luar scope Anda.');
        }

        $service = Service::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', (string) $validated['service_id'])
            ->first();

        if (! $service) {
            $this->failOutletServiceValidation('Service tidak ditemukan dalam tenant ini.');
        }

        $outletService = OutletService::query()->firstOrNew([
            'outlet_id' => $outlet->id,
            'service_id' => $service->id,
        ]);
        $created = ! $outletService->exists;

        if (array_key_exists('active', $validated)) {
            $outletService->active = (bool) $validated['active'];
        } elseif ($created) {
            $outletService->active = true;
        }

        if (array_key_exists('price_override_amount', $validated)) {
            $outletService->price_override_amount = $validated['price_override_amount'];
        }

        if (array_key_exists('sla_override', $validated)) {
            $rawSla = is_string($validated['sla_override']) ? trim($validated['sla_override']) : null;
            $outletService->sla_override = $rawSla === '' ? null : $rawSla;
        }

        $outletService->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::OUTLET_SERVICE_OVERRIDE_UPSERTED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $outletService->outlet_id,
            entityType: 'outlet_service',
            entityId: $outletService->id,
            metadata: [
                'created' => $created,
                'service_id' => $outletService->service_id,
                'service_name' => $service->name,
                'active' => $outletService->active,
                'price_override_amount' => $outletService->price_override_amount,
                'sla_override' => $outletService->sla_override,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.outlet-services.index', ['tenant' => $tenant->id])
            ->with('status', 'Outlet service override berhasil disimpan.');
    }

    public function updateOutletService(Request $request, Tenant $tenant, string $outletService): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = $this->findOutletServiceInScope($actor, $tenant, $outletService);

        if (! $target) {
            abort(404, 'Outlet service not found in tenant scope.');
        }

        $validated = $request->validate([
            'active' => ['nullable', 'boolean'],
            'price_override_amount' => ['nullable', 'integer', 'min:0'],
            'sla_override' => ['nullable', 'string', 'max:100'],
        ]);

        if (! array_key_exists('active', $validated)
            && ! array_key_exists('price_override_amount', $validated)
            && ! array_key_exists('sla_override', $validated)) {
            $this->failOutletServiceValidation('Tidak ada field update yang dikirim.');
        }

        $before = [
            'active' => (bool) $target->active,
            'price_override_amount' => $target->price_override_amount,
            'sla_override' => $target->sla_override,
        ];

        if (array_key_exists('active', $validated)) {
            $target->active = (bool) $validated['active'];
        }

        if (array_key_exists('price_override_amount', $validated)) {
            $target->price_override_amount = $validated['price_override_amount'];
        }

        if (array_key_exists('sla_override', $validated)) {
            $rawSla = is_string($validated['sla_override']) ? trim($validated['sla_override']) : null;
            $target->sla_override = $rawSla === '' ? null : $rawSla;
        }

        $target->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::OUTLET_SERVICE_OVERRIDE_UPDATED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $target->outlet_id,
            entityType: 'outlet_service',
            entityId: $target->id,
            metadata: [
                'service_id' => $target->service_id,
                'service_name' => $target->service?->name,
                'before' => $before,
                'after' => [
                    'active' => (bool) $target->active,
                    'price_override_amount' => $target->price_override_amount,
                    'sla_override' => $target->sla_override,
                ],
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.outlet-services.index', ['tenant' => $tenant->id])
            ->with('status', 'Outlet service override berhasil diperbarui.');
    }

    public function shippingZones(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $filters = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'active' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:120'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $outletsQuery = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name');

        if (! $ownerMode) {
            $outletsQuery->whereIn('id', $allowedOutletIds);
        }

        $outlets = $outletsQuery->get(['id', 'name', 'code']);

        $zonesQuery = ShippingZone::query()
            ->where('tenant_id', $tenant->id)
            ->with('outlet:id,name,code')
            ->latest('created_at');

        if (! $ownerMode) {
            $zonesQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        if (! empty($filters['outlet_id'])) {
            $zonesQuery->where('outlet_id', $filters['outlet_id']);
        }

        if (array_key_exists('active', $filters)) {
            $zonesQuery->where('active', (bool) $filters['active']);
        }

        if (! empty($filters['search'])) {
            $zonesQuery->where('name', 'like', '%'.$filters['search'].'%');
        }

        $rows = $zonesQuery->get();
        $activeRows = $rows->where('active', true)->values();
        $inactiveRows = $rows->where('active', false)->values();

        return view('web.management.shipping-zones', [
            'tenant' => $tenant,
            'user' => $user,
            'ownerMode' => $ownerMode,
            'filters' => $filters,
            'outlets' => $outlets,
            'rows' => $rows,
            'activeRows' => $activeRows,
            'inactiveRows' => $inactiveRows,
        ]);
    }

    public function storeShippingZone(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'name' => [
                'required',
                'string',
                'max:120',
                Rule::unique('shipping_zones', 'name')->where(
                    fn ($query) => $query->where('outlet_id', (string) $request->input('outlet_id')),
                ),
            ],
            'min_distance_km' => ['nullable', 'numeric', 'min:0'],
            'max_distance_km' => ['nullable', 'numeric', 'min:0', 'gte:min_distance_km'],
            'fee_amount' => ['required', 'integer', 'min:0'],
            'eta_minutes' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string'],
        ]);

        $outlet = $this->findOutletInScope($actor, $tenant, (string) $validated['outlet_id']);

        if (! $outlet) {
            $this->failShippingZoneValidation('Outlet tidak ditemukan atau di luar scope Anda.');
        }

        $zone = ShippingZone::query()->create([
            'tenant_id' => $tenant->id,
            'outlet_id' => $outlet->id,
            'name' => (string) $validated['name'],
            'min_distance_km' => $validated['min_distance_km'] ?? null,
            'max_distance_km' => $validated['max_distance_km'] ?? null,
            'fee_amount' => (int) $validated['fee_amount'],
            'eta_minutes' => $validated['eta_minutes'] ?? null,
            'active' => (bool) ($validated['active'] ?? true),
            'notes' => $validated['notes'] ?? null,
        ]);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SHIPPING_ZONE_CREATED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $zone->outlet_id,
            entityType: 'shipping_zone',
            entityId: $zone->id,
            metadata: [
                'name' => $zone->name,
                'fee_amount' => $zone->fee_amount,
                'active' => $zone->active,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.shipping-zones.index', ['tenant' => $tenant->id])
            ->with('status', 'Shipping zone berhasil dibuat.');
    }

    public function updateShippingZone(Request $request, Tenant $tenant, string $zone): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = $this->findShippingZoneInScope($actor, $tenant, $zone);

        if (! $target) {
            abort(404, 'Shipping zone not found in tenant scope.');
        }

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:120',
                Rule::unique('shipping_zones', 'name')
                    ->where(fn ($query) => $query->where('outlet_id', (string) $target->outlet_id))
                    ->ignore($target->id),
            ],
            'min_distance_km' => ['nullable', 'numeric', 'min:0'],
            'max_distance_km' => ['nullable', 'numeric', 'min:0', 'gte:min_distance_km'],
            'fee_amount' => ['required', 'integer', 'min:0'],
            'eta_minutes' => ['nullable', 'integer', 'min:1', 'max:10000'],
            'notes' => ['nullable', 'string'],
        ]);

        $before = [
            'name' => $target->name,
            'min_distance_km' => $target->min_distance_km,
            'max_distance_km' => $target->max_distance_km,
            'fee_amount' => $target->fee_amount,
            'eta_minutes' => $target->eta_minutes,
            'notes' => $target->notes,
        ];

        $target->forceFill([
            'name' => (string) $validated['name'],
            'min_distance_km' => $validated['min_distance_km'] ?? null,
            'max_distance_km' => $validated['max_distance_km'] ?? null,
            'fee_amount' => (int) $validated['fee_amount'],
            'eta_minutes' => $validated['eta_minutes'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SHIPPING_ZONE_UPDATED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $target->outlet_id,
            entityType: 'shipping_zone',
            entityId: $target->id,
            metadata: [
                'before' => $before,
                'after' => [
                    'name' => $target->name,
                    'min_distance_km' => $target->min_distance_km,
                    'max_distance_km' => $target->max_distance_km,
                    'fee_amount' => $target->fee_amount,
                    'eta_minutes' => $target->eta_minutes,
                    'notes' => $target->notes,
                ],
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.shipping-zones.index', ['tenant' => $tenant->id])
            ->with('status', 'Shipping zone berhasil diperbarui.');
    }

    public function deactivateShippingZone(Request $request, Tenant $tenant, string $zone): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = $this->findShippingZoneInScope($actor, $tenant, $zone);

        if (! $target) {
            abort(404, 'Shipping zone not found in tenant scope.');
        }

        if (! $target->active) {
            $this->failShippingZoneValidation('Shipping zone sudah nonaktif.');
        }

        $target->forceFill(['active' => false])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SHIPPING_ZONE_DEACTIVATED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $target->outlet_id,
            entityType: 'shipping_zone',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.shipping-zones.index', ['tenant' => $tenant->id])
            ->with('status', 'Shipping zone berhasil dinonaktifkan.');
    }

    public function activateShippingZone(Request $request, Tenant $tenant, string $zone): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = $this->findShippingZoneInScope($actor, $tenant, $zone);

        if (! $target) {
            abort(404, 'Shipping zone not found in tenant scope.');
        }

        if ($target->active) {
            $this->failShippingZoneValidation('Shipping zone sudah aktif.');
        }

        $target->forceFill(['active' => true])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SHIPPING_ZONE_ACTIVATED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $target->outlet_id,
            entityType: 'shipping_zone',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.shipping-zones.index', ['tenant' => $tenant->id])
            ->with('status', 'Shipping zone berhasil diaktifkan.');
    }

    public function archiveUser(Request $request, Tenant $tenant, string $managedUser): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureOwnerPanelAccess($actor, $tenant);

        $target = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $managedUser)
            ->with('roles:id,key,name')
            ->first();

        if (! $target) {
            abort(404, 'User not found in tenant scope.');
        }

        if ($target->id === $actor->id) {
            $this->failValidation('Anda tidak bisa mengarsipkan akun sendiri.');
        }

        if ($target->hasRole('owner')) {
            $activeOwnerCount = User::query()
                ->where('tenant_id', $tenant->id)
                ->whereHas('roles', function ($query): void {
                    $query->where('key', 'owner');
                })
                ->count();

            if ($activeOwnerCount <= 1) {
                $this->failValidation('Tidak bisa mengarsipkan owner aktif terakhir.');
            }
        }

        $target->tokens()->delete();
        $target->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_ARCHIVED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'roles' => $target->roles->pluck('key')->values()->all(),
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.users.index', ['tenant' => $tenant->id])
            ->with('status', 'User berhasil diarsipkan.');
    }

    public function restoreUser(Request $request, Tenant $tenant, string $managedUser): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureOwnerPanelAccess($actor, $tenant);

        $target = User::withTrashed()
            ->where('tenant_id', $tenant->id)
            ->where('id', $managedUser)
            ->with('roles:id,key,name')
            ->first();

        if (! $target) {
            abort(404, 'User not found in tenant scope.');
        }

        if (! $target->trashed()) {
            $this->failValidation('User sudah aktif.');
        }

        $target->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::USER_RESTORED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'user',
            entityId: (string) $target->id,
            metadata: [
                'email' => $target->email,
                'roles' => $target->roles->pluck('key')->values()->all(),
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.users.index', ['tenant' => $tenant->id])
            ->with('status', 'User berhasil dipulihkan.');
    }

    public function archiveCustomer(Request $request, Tenant $tenant, string $customer): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = Customer::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $customer)
            ->first();

        if (! $target) {
            abort(404, 'Customer not found in tenant scope.');
        }

        $target->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::CUSTOMER_ARCHIVED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'customer',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
                'phone_normalized' => $target->phone_normalized,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.customers.index', ['tenant' => $tenant->id])
            ->with('status', 'Customer berhasil diarsipkan.');
    }

    public function restoreCustomer(Request $request, Tenant $tenant, string $customer): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = Customer::withTrashed()
            ->where('tenant_id', $tenant->id)
            ->where('id', $customer)
            ->first();

        if (! $target) {
            abort(404, 'Customer not found in tenant scope.');
        }

        if (! $target->trashed()) {
            $this->failValidation('Customer sudah aktif.');
        }

        $target->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::CUSTOMER_RESTORED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'customer',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
                'phone_normalized' => $target->phone_normalized,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.customers.index', ['tenant' => $tenant->id])
            ->with('status', 'Customer berhasil dipulihkan.');
    }

    public function archiveService(Request $request, Tenant $tenant, string $service): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = Service::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $service)
            ->first();

        if (! $target) {
            abort(404, 'Service not found in tenant scope.');
        }

        $target->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_ARCHIVED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'service',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
                'unit_type' => $target->unit_type,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.services.index', ['tenant' => $tenant->id])
            ->with('status', 'Service berhasil diarsipkan.');
    }

    public function restoreService(Request $request, Tenant $tenant, string $service): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensurePanelAccess($actor, $tenant);

        $target = Service::withTrashed()
            ->where('tenant_id', $tenant->id)
            ->where('id', $service)
            ->first();

        if (! $target) {
            abort(404, 'Service not found in tenant scope.');
        }

        if (! $target->trashed()) {
            $this->failValidation('Service sudah aktif.');
        }

        $target->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_RESTORED,
            actor: $actor,
            tenantId: $tenant->id,
            entityType: 'service',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
                'unit_type' => $target->unit_type,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.services.index', ['tenant' => $tenant->id])
            ->with('status', 'Service berhasil dipulihkan.');
    }

    public function archiveOutlet(Request $request, Tenant $tenant, string $outlet): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureOwnerPanelAccess($actor, $tenant);

        $target = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $outlet)
            ->first();

        if (! $target) {
            abort(404, 'Outlet not found in tenant scope.');
        }

        $activeOutletCount = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->count();

        if ($activeOutletCount <= 1) {
            $this->failValidation('Tidak bisa mengarsipkan outlet aktif terakhir.');
        }

        $target->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::OUTLET_ARCHIVED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $target->id,
            entityType: 'outlet',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
                'code' => $target->code,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.outlets.index', ['tenant' => $tenant->id])
            ->with('status', 'Outlet berhasil diarsipkan.');
    }

    public function restoreOutlet(Request $request, Tenant $tenant, string $outlet): RedirectResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $this->ensureOwnerPanelAccess($actor, $tenant);

        $target = Outlet::withTrashed()
            ->where('tenant_id', $tenant->id)
            ->where('id', $outlet)
            ->first();

        if (! $target) {
            abort(404, 'Outlet not found in tenant scope.');
        }

        if (! $target->trashed()) {
            $this->failValidation('Outlet sudah aktif.');
        }

        $target->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::OUTLET_RESTORED,
            actor: $actor,
            tenantId: $tenant->id,
            outletId: $target->id,
            entityType: 'outlet',
            entityId: $target->id,
            metadata: [
                'name' => $target->name,
                'code' => $target->code,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.outlets.index', ['tenant' => $tenant->id])
            ->with('status', 'Outlet berhasil dipulihkan.');
    }

    private function findOutletInScope(User $user, Tenant $tenant, string $outletId): ?Outlet
    {
        $query = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $outletId);

        if (! $this->isOwner($user)) {
            $query->whereIn('id', $this->allowedOutletIds($user, $tenant->id));
        }

        return $query->first();
    }

    private function findShippingZoneInScope(User $user, Tenant $tenant, string $zoneId): ?ShippingZone
    {
        $query = ShippingZone::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $zoneId);

        if (! $this->isOwner($user)) {
            $query->whereIn('outlet_id', $this->allowedOutletIds($user, $tenant->id));
        }

        return $query->first();
    }

    private function findOutletServiceInScope(User $user, Tenant $tenant, string $outletServiceId): ?OutletService
    {
        $query = OutletService::query()
            ->where('id', $outletServiceId)
            ->whereHas('outlet', fn ($q) => $q->where('tenant_id', $tenant->id))
            ->whereHas('service', fn ($q) => $q->where('tenant_id', $tenant->id))
            ->with([
                'outlet:id,name,code,tenant_id',
                'service:id,tenant_id,name,unit_type,base_price_amount,active',
            ]);

        if (! $this->isOwner($user)) {
            $query->whereIn('outlet_id', $this->allowedOutletIds($user, $tenant->id));
        }

        return $query->first();
    }

    private function assignableOutlets(User $actor, Tenant $tenant): Collection
    {
        $query = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name');

        if (! $this->isOwner($actor)) {
            $query->whereIn('id', $this->allowedOutletIds($actor, $tenant->id));
        }

        return $query->get(['id', 'name', 'code']);
    }

    private function availableRoleOptions(User $actor): Collection
    {
        $orderedKeys = $this->isOwner($actor)
            ? ['admin', 'cashier', 'worker', 'courier']
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
    private function sanitizeAssignedOutletIds(User $actor, Tenant $tenant, array $outletIds): array
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

        $allowedOutletIds = $this->assignableOutlets($actor, $tenant)
            ->pluck('id')
            ->map(fn ($id): string => (string) $id)
            ->all();

        $invalidOutletIds = array_diff($selectedOutletIds, $allowedOutletIds);

        if ($invalidOutletIds !== []) {
            $this->failUserManagementValidation('Ada outlet assignment di luar scope Anda.');
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

    private function ensureOwnerPanelAccess(User $user, Tenant $tenant): void
    {
        $this->ensurePanelAccess($user, $tenant);

        if (! $this->isOwner($user)) {
            abort(403, 'Only owner can manage archive/restore action.');
        }
    }

    private function failValidation(string $message): never
    {
        throw ValidationException::withMessages([
            'lifecycle' => [$message],
        ]);
    }

    private function failShippingZoneValidation(string $message): never
    {
        throw ValidationException::withMessages([
            'shipping_zone' => [$message],
        ]);
    }

    private function failOutletServiceValidation(string $message): never
    {
        throw ValidationException::withMessages([
            'outlet_service' => [$message],
        ]);
    }

    private function failUserManagementValidation(string $message): never
    {
        throw ValidationException::withMessages([
            'user_management' => [$message],
        ]);
    }
}
