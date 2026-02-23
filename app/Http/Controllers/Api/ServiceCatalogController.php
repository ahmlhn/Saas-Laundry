<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\OutletService;
use App\Models\Service;
use App\Models\ServiceProcessTag;
use App\Models\ServiceProcessTagLink;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class ServiceCatalogController extends Controller
{
    use EnsuresApiAccess;

    private const SERVICE_TYPES = ['regular', 'package', 'perfume', 'item'];

    private const DISPLAY_UNITS = ['kg', 'pcs', 'satuan'];

    private const PACKAGE_QUOTA_UNITS = ['kg', 'pcs'];

    private const PACKAGE_ACCUMULATION_MODES = ['accumulative', 'fixed_window'];

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function services(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'active' => ['nullable', 'boolean'],
            'outlet_id' => ['nullable', 'uuid'],
            'include_deleted' => ['nullable', 'boolean'],
            'service_type' => ['nullable'],
            'parent_id' => ['nullable', 'uuid'],
            'is_group' => ['nullable', 'boolean'],
            'with_children' => ['nullable', 'boolean'],
            'q' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', 'string', Rule::in(['name', 'updated_desc', 'price_asc', 'price_desc'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:250'],
        ]);

        $serviceTypes = $this->parseServiceTypes($validated['service_type'] ?? null);
        if ($serviceTypes === null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nilai service_type tidak valid.',
            ], 422);
        }

        $outletId = $validated['outlet_id'] ?? null;
        $includeDeleted = (bool) ($validated['include_deleted'] ?? false);
        $withChildren = (bool) ($validated['with_children'] ?? false);
        $limit = (int) ($validated['limit'] ?? 200);

        if ($outletId) {
            $this->ensureOutletAccess($user, $outletId);
        }

        if ($includeDeleted) {
            $this->ensureRole($user, ['owner', 'admin']);
        }

        $query = Service::query()
            ->where('tenant_id', $user->tenant_id)
            ->with([
                'processTags' => function ($tagQuery): void {
                    $tagQuery->orderBy('sort_order')->orderBy('name');
                },
            ]);

        if ($includeDeleted) {
            $query->withTrashed();
        }

        if (array_key_exists('active', $validated)) {
            $query->where('active', (bool) $validated['active']);
        }

        if ($serviceTypes !== []) {
            $query->whereIn('service_type', $serviceTypes);
        }

        if ($request->has('parent_id')) {
            $parentId = $validated['parent_id'] ?? null;
            if ($parentId) {
                $query->where('parent_service_id', $parentId);
            } else {
                $query->whereNull('parent_service_id');
            }
        }

        if (array_key_exists('is_group', $validated)) {
            $query->where('is_group', (bool) $validated['is_group']);
        }

        $search = trim((string) ($validated['q'] ?? ''));
        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $this->applySort($query, $validated['sort'] ?? 'name');

        if ($withChildren) {
            $query->with([
                'children' => function ($childQuery) use ($includeDeleted, $serviceTypes, $validated, $search): void {
                    if ($includeDeleted) {
                        $childQuery->withTrashed();
                    }

                    if (array_key_exists('active', $validated)) {
                        $childQuery->where('active', (bool) $validated['active']);
                    }

                    if ($serviceTypes !== []) {
                        $childQuery->whereIn('service_type', $serviceTypes);
                    }

                    if ($search !== '') {
                        $childQuery->where('name', 'like', "%{$search}%");
                    }

                    $childQuery
                        ->with([
                            'processTags' => function ($tagQuery): void {
                                $tagQuery->orderBy('sort_order')->orderBy('name');
                            },
                        ])
                        ->orderBy('sort_order')
                        ->orderBy('name');
                },
            ]);
        }

        $services = $query->limit($limit)->get();
        $outletOverrides = $this->loadOutletOverrides($outletId);

        return response()->json([
            'data' => $services->map(function (Service $service) use ($outletOverrides, $withChildren): array {
                /** @var OutletService|null $override */
                $override = $outletOverrides->get((string) $service->id);

                return $this->serializeService(
                    service: $service,
                    override: $override,
                    outletOverrides: $outletOverrides,
                    includeChildren: $withChildren
                );
            })->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'service_type' => ['nullable', 'string', Rule::in(self::SERVICE_TYPES)],
            'parent_service_id' => ['nullable', 'uuid'],
            'is_group' => ['nullable', 'boolean'],
            'unit_type' => ['nullable', 'string', Rule::in(['kg', 'pcs'])],
            'display_unit' => ['nullable', 'string', Rule::in(self::DISPLAY_UNITS)],
            'base_price_amount' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'duration_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'package_quota_value' => ['nullable', 'numeric', 'min:0.01', 'max:99999999'],
            'package_quota_unit' => ['nullable', 'string', Rule::in(self::PACKAGE_QUOTA_UNITS)],
            'package_valid_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'package_accumulation_mode' => ['nullable', 'string', Rule::in(self::PACKAGE_ACCUMULATION_MODES)],
            'active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:-100000', 'max:100000'],
            'image_icon' => ['nullable', 'string', 'max:80'],
            'process_tag_ids' => ['nullable', 'array'],
            'process_tag_ids.*' => ['uuid'],
        ]);

        $serviceType = (string) ($validated['service_type'] ?? 'regular');
        $parentServiceId = $validated['parent_service_id'] ?? null;
        $isGroup = (bool) ($validated['is_group'] ?? false);
        $name = trim((string) $validated['name']);

        if ($name === '') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama layanan wajib diisi.',
            ], 422);
        }

        if ($isGroup && $parentServiceId !== null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Group layanan tidak boleh memiliki parent.',
            ], 422);
        }

        $parent = $this->resolveParentService($user, $parentServiceId, $serviceType);
        if ($parentServiceId !== null && ! $parent) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Parent layanan tidak valid untuk tenant ini.',
            ], 422);
        }

        if ($this->serviceNameExists(
            tenantId: (string) $user->tenant_id,
            serviceType: $serviceType,
            parentServiceId: $parentServiceId,
            name: $name,
        )) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama layanan sudah digunakan pada level yang sama.',
            ], 422);
        }

        $unitType = (string) ($validated['unit_type'] ?? (($validated['display_unit'] ?? '') === 'kg' ? 'kg' : 'pcs'));
        $displayUnit = (string) ($validated['display_unit'] ?? $this->defaultDisplayUnit($unitType));

        $packageFields = $this->normalizePackageFields($serviceType, $validated, null);
        if ($packageFields === null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Field paket wajib lengkap untuk layanan paket.',
            ], 422);
        }

        $service = Service::query()->create([
            'tenant_id' => $user->tenant_id,
            'name' => $name,
            'service_type' => $serviceType,
            'parent_service_id' => $parentServiceId,
            'is_group' => $isGroup,
            'unit_type' => $unitType,
            'display_unit' => $displayUnit,
            'base_price_amount' => (int) $validated['base_price_amount'],
            'duration_days' => $validated['duration_days'] ?? null,
            'package_quota_value' => $packageFields['package_quota_value'],
            'package_quota_unit' => $packageFields['package_quota_unit'],
            'package_valid_days' => $packageFields['package_valid_days'],
            'package_accumulation_mode' => $packageFields['package_accumulation_mode'],
            'active' => (bool) ($validated['active'] ?? true),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'image_icon' => $validated['image_icon'] ?? null,
        ]);

        $this->syncProcessTags($service, $user, $validated['process_tag_ids'] ?? []);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_CREATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service',
            entityId: (string) $service->id,
            metadata: [
                'service_name' => $service->name,
                'service_type' => $service->service_type,
                'is_group' => (bool) $service->is_group,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeService($service->fresh(['processTags'])),
        ], 201);
    }

    public function update(Request $request, Service $service): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($service->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested service.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:150'],
            'service_type' => ['nullable', 'string', Rule::in(self::SERVICE_TYPES)],
            'parent_service_id' => ['nullable', 'uuid'],
            'is_group' => ['nullable', 'boolean'],
            'unit_type' => ['nullable', 'string', Rule::in(['kg', 'pcs'])],
            'display_unit' => ['nullable', 'string', Rule::in(self::DISPLAY_UNITS)],
            'base_price_amount' => ['nullable', 'integer', 'min:0', 'max:1000000000'],
            'duration_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'package_quota_value' => ['nullable', 'numeric', 'min:0.01', 'max:99999999'],
            'package_quota_unit' => ['nullable', 'string', Rule::in(self::PACKAGE_QUOTA_UNITS)],
            'package_valid_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'package_accumulation_mode' => ['nullable', 'string', Rule::in(self::PACKAGE_ACCUMULATION_MODES)],
            'active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:-100000', 'max:100000'],
            'image_icon' => ['nullable', 'string', 'max:80'],
            'process_tag_ids' => ['nullable', 'array'],
            'process_tag_ids.*' => ['uuid'],
        ]);

        $nextServiceType = (string) ($validated['service_type'] ?? $service->service_type);
        $nextParentId = $request->has('parent_service_id')
            ? ($validated['parent_service_id'] ?? null)
            : $service->parent_service_id;
        $nextIsGroup = array_key_exists('is_group', $validated)
            ? (bool) $validated['is_group']
            : (bool) $service->is_group;
        $nextName = trim((string) ($validated['name'] ?? $service->name));

        if ($nextName === '') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama layanan wajib diisi.',
            ], 422);
        }

        if ($nextIsGroup && $nextParentId !== null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Group layanan tidak boleh memiliki parent.',
            ], 422);
        }

        if ($nextParentId !== null && (string) $service->id === $nextParentId) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Parent layanan tidak boleh dirinya sendiri.',
            ], 422);
        }

        $hasChildren = Service::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('parent_service_id', $service->id)
            ->exists();

        if (! $nextIsGroup && $hasChildren) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Layanan group yang masih punya varian tidak bisa diubah menjadi non-group.',
            ], 422);
        }

        if ($nextServiceType !== $service->service_type && $hasChildren) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Tipe layanan group tidak bisa diubah selama masih punya varian.',
            ], 422);
        }

        $parent = $this->resolveParentService($user, $nextParentId, $nextServiceType);
        if ($nextParentId !== null && ! $parent) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Parent layanan tidak valid untuk tenant ini.',
            ], 422);
        }

        if ($this->serviceNameExists(
            tenantId: (string) $user->tenant_id,
            serviceType: $nextServiceType,
            parentServiceId: $nextParentId,
            name: $nextName,
            exceptId: (string) $service->id,
        )) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama layanan sudah digunakan pada level yang sama.',
            ], 422);
        }

        $nextUnitType = (string) ($validated['unit_type'] ?? $service->unit_type);
        $nextDisplayUnit = (string) ($validated['display_unit'] ?? $service->display_unit ?? $this->defaultDisplayUnit($nextUnitType));
        $packageFields = $this->normalizePackageFields($nextServiceType, $validated, $service);

        if ($packageFields === null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Field paket wajib lengkap untuk layanan paket.',
            ], 422);
        }

        $changes = [
            'name' => $nextName,
            'service_type' => $nextServiceType,
            'parent_service_id' => $nextParentId,
            'is_group' => $nextIsGroup,
            'unit_type' => $nextUnitType,
            'display_unit' => $nextDisplayUnit,
            'base_price_amount' => array_key_exists('base_price_amount', $validated)
                ? (int) $validated['base_price_amount']
                : (int) $service->base_price_amount,
            'duration_days' => array_key_exists('duration_days', $validated) ? $validated['duration_days'] : $service->duration_days,
            'package_quota_value' => $packageFields['package_quota_value'],
            'package_quota_unit' => $packageFields['package_quota_unit'],
            'package_valid_days' => $packageFields['package_valid_days'],
            'package_accumulation_mode' => $packageFields['package_accumulation_mode'],
            'active' => array_key_exists('active', $validated) ? (bool) $validated['active'] : (bool) $service->active,
            'sort_order' => array_key_exists('sort_order', $validated) ? (int) $validated['sort_order'] : (int) $service->sort_order,
            'image_icon' => array_key_exists('image_icon', $validated) ? $validated['image_icon'] : $service->image_icon,
        ];

        $service->fill($changes)->save();

        if (array_key_exists('process_tag_ids', $validated)) {
            $this->syncProcessTags($service, $user, $validated['process_tag_ids'] ?? []);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service',
            entityId: (string) $service->id,
            metadata: [
                'updated_fields' => array_keys($changes),
                'service_name' => $service->name,
                'service_type' => $service->service_type,
                'is_group' => (bool) $service->is_group,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeService($service->fresh(['processTags'])),
        ]);
    }

    public function destroy(Request $request, Service $service): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($service->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested service.',
            ], 403);
        }

        $service->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_ARCHIVED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service',
            entityId: (string) $service->id,
            metadata: [
                'service_name' => $service->name,
                'service_type' => $service->service_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => $service->id,
                'deleted_at' => $service->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    public function restore(Request $request, string $serviceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $service = Service::withTrashed()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $serviceId)
            ->first();

        if (! $service) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Service not found in tenant scope.',
            ], 404);
        }

        if (! $service->trashed()) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Service is already active.',
            ], 422);
        }

        $service->restore();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SERVICE_RESTORED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'service',
            entityId: (string) $service->id,
            metadata: [
                'service_name' => $service->name,
                'service_type' => $service->service_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeService($service->fresh(['processTags'])),
        ]);
    }

    /**
     * @param array<int, string> $serviceTypes
     */
    private function serviceNameExists(string $tenantId, string $serviceType, ?string $parentServiceId, string $name, ?string $exceptId = null): bool
    {
        $query = Service::withTrashed()
            ->where('tenant_id', $tenantId)
            ->where('service_type', $serviceType)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)]);

        if ($parentServiceId === null) {
            $query->whereNull('parent_service_id');
        } else {
            $query->where('parent_service_id', $parentServiceId);
        }

        if ($exceptId !== null) {
            $query->where('id', '!=', $exceptId);
        }

        return $query->exists();
    }

    private function resolveParentService(User $user, ?string $parentServiceId, string $serviceType): ?Service
    {
        if ($parentServiceId === null) {
            return null;
        }

        $parent = Service::withTrashed()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $parentServiceId)
            ->first();

        if (! $parent) {
            return null;
        }

        if (! $parent->is_group || $parent->service_type !== $serviceType) {
            return null;
        }

        return $parent;
    }

    private function defaultDisplayUnit(string $unitType): string
    {
        return $unitType === 'kg' ? 'kg' : 'pcs';
    }

    /**
     * @param array<string, mixed> $validated
     * @return array{
     *     package_quota_value: float|null,
     *     package_quota_unit: string|null,
     *     package_valid_days: int|null,
     *     package_accumulation_mode: string|null
     * }|null
     */
    private function normalizePackageFields(string $serviceType, array $validated, ?Service $existing): ?array
    {
        $quotaValue = array_key_exists('package_quota_value', $validated)
            ? (float) $validated['package_quota_value']
            : ($existing?->package_quota_value !== null ? (float) $existing->package_quota_value : null);
        $quotaUnit = array_key_exists('package_quota_unit', $validated)
            ? $validated['package_quota_unit']
            : $existing?->package_quota_unit;
        $validDays = array_key_exists('package_valid_days', $validated)
            ? ($validated['package_valid_days'] !== null ? (int) $validated['package_valid_days'] : null)
            : $existing?->package_valid_days;
        $mode = array_key_exists('package_accumulation_mode', $validated)
            ? $validated['package_accumulation_mode']
            : $existing?->package_accumulation_mode;

        if ($serviceType !== 'package') {
            return [
                'package_quota_value' => null,
                'package_quota_unit' => null,
                'package_valid_days' => null,
                'package_accumulation_mode' => null,
            ];
        }

        if ($quotaValue === null || $quotaUnit === null || $validDays === null || $mode === null) {
            return null;
        }

        return [
            'package_quota_value' => $quotaValue,
            'package_quota_unit' => (string) $quotaUnit,
            'package_valid_days' => $validDays,
            'package_accumulation_mode' => (string) $mode,
        ];
    }

    /**
     * @param mixed $rawValue
     * @return array<int, string>|null
     */
    private function parseServiceTypes(mixed $rawValue): ?array
    {
        if ($rawValue === null || $rawValue === '') {
            return [];
        }

        $normalized = [];

        if (is_string($rawValue)) {
            $normalized = [trim($rawValue)];
        } elseif (is_array($rawValue)) {
            foreach ($rawValue as $item) {
                if (! is_string($item)) {
                    return null;
                }
                $normalized[] = trim($item);
            }
        } else {
            return null;
        }

        $normalized = array_values(array_filter($normalized, static fn (string $value): bool => $value !== ''));

        foreach ($normalized as $type) {
            if (! in_array($type, self::SERVICE_TYPES, true)) {
                return null;
            }
        }

        return array_values(array_unique($normalized));
    }

    private function applySort(Builder $query, string $sort): void
    {
        if ($sort === 'updated_desc') {
            $query->orderByDesc('updated_at')->orderBy('name');
            return;
        }

        if ($sort === 'price_asc') {
            $query->orderBy('base_price_amount')->orderBy('name');
            return;
        }

        if ($sort === 'price_desc') {
            $query->orderByDesc('base_price_amount')->orderBy('name');
            return;
        }

        $query->orderBy('sort_order')->orderBy('name');
    }

    /**
     * @return Collection<string, OutletService>
     */
    private function loadOutletOverrides(?string $outletId): Collection
    {
        if (! $outletId) {
            return collect();
        }

        return OutletService::query()
            ->where('outlet_id', $outletId)
            ->get()
            ->keyBy(fn (OutletService $override): string => (string) $override->service_id);
    }

    /**
     * @param array<int, string> $processTagIds
     */
    private function syncProcessTags(Service $service, User $user, array $processTagIds): void
    {
        $normalizedIds = collect($processTagIds)
            ->filter(fn ($id): bool => is_string($id) && trim($id) !== '')
            ->map(fn (string $id): string => trim($id))
            ->unique()
            ->values()
            ->all();

        if ($normalizedIds === []) {
            $service->processTags()->sync([]);
            return;
        }

        $validTagIds = ServiceProcessTag::query()
            ->where('tenant_id', $user->tenant_id)
            ->whereIn('id', $normalizedIds)
            ->pluck('id')
            ->map(fn ($id): string => (string) $id)
            ->all();

        if (count($validTagIds) !== count($normalizedIds)) {
            abort(response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Salah satu tag proses tidak valid untuk tenant ini.',
            ], 422));
        }

        /** @var \Illuminate\Support\Collection<string, ServiceProcessTagLink> $existingLinks */
        $existingLinks = ServiceProcessTagLink::query()
            ->where('service_id', $service->id)
            ->get()
            ->keyBy(fn (ServiceProcessTagLink $link): string => (string) $link->tag_id);

        foreach ($normalizedIds as $index => $tagId) {
            /** @var ServiceProcessTagLink|null $existingLink */
            $existingLink = $existingLinks->get($tagId);
            if ($existingLink) {
                if ((int) $existingLink->sort_order !== $index) {
                    $existingLink->sort_order = $index;
                    $existingLink->save();
                }
                continue;
            }

            ServiceProcessTagLink::query()->create([
                'service_id' => $service->id,
                'tag_id' => $tagId,
                'sort_order' => $index,
            ]);
        }

        ServiceProcessTagLink::query()
            ->where('service_id', $service->id)
            ->whereNotIn('tag_id', $normalizedIds)
            ->delete();
    }

    /**
     * @param Collection<string, OutletService>|null $outletOverrides
     */
    private function serializeService(
        Service $service,
        ?OutletService $override = null,
        ?Collection $outletOverrides = null,
        bool $includeChildren = false
    ): array {
        $effectiveOverride = $override;
        if (! $effectiveOverride && $outletOverrides) {
            /** @var OutletService|null $fallbackOverride */
            $fallbackOverride = $outletOverrides->get((string) $service->id);
            $effectiveOverride = $fallbackOverride;
        }

        $processTags = $service->relationLoaded('processTags')
            ? $service->processTags->map(fn (ServiceProcessTag $tag): array => [
                'id' => (string) $tag->id,
                'name' => (string) $tag->name,
                'color_hex' => (string) $tag->color_hex,
                'sort_order' => (int) ($tag->pivot->sort_order ?? $tag->sort_order ?? 0),
                'active' => (bool) $tag->active,
            ])->values()->all()
            : [];

        $payload = [
            'id' => (string) $service->id,
            'tenant_id' => (string) $service->tenant_id,
            'name' => (string) $service->name,
            'service_type' => (string) $service->service_type,
            'parent_service_id' => $service->parent_service_id ? (string) $service->parent_service_id : null,
            'is_group' => (bool) $service->is_group,
            'unit_type' => (string) $service->unit_type,
            'display_unit' => (string) ($service->display_unit ?? $this->defaultDisplayUnit((string) $service->unit_type)),
            'base_price_amount' => (int) $service->base_price_amount,
            'duration_days' => $service->duration_days !== null ? (int) $service->duration_days : null,
            'package_quota_value' => $service->package_quota_value !== null ? (float) $service->package_quota_value : null,
            'package_quota_unit' => $service->package_quota_unit,
            'package_valid_days' => $service->package_valid_days !== null ? (int) $service->package_valid_days : null,
            'package_accumulation_mode' => $service->package_accumulation_mode,
            'active' => (bool) $service->active,
            'sort_order' => (int) ($service->sort_order ?? 0),
            'image_icon' => $service->image_icon,
            'deleted_at' => $service->deleted_at?->toIso8601String(),
            'effective_price_amount' => (int) ($effectiveOverride?->price_override_amount ?? $service->base_price_amount),
            'outlet_override' => $effectiveOverride ? [
                'id' => (string) $effectiveOverride->id,
                'active' => (bool) $effectiveOverride->active,
                'price_override_amount' => $effectiveOverride->price_override_amount !== null ? (int) $effectiveOverride->price_override_amount : null,
                'sla_override' => $effectiveOverride->sla_override,
            ] : null,
            'process_tags' => $processTags,
            'process_summary' => $processTags !== []
                ? implode(' • ', array_map(static fn (array $tag): string => (string) $tag['name'], $processTags))
                : null,
            'children' => [],
        ];

        if ($includeChildren && $service->relationLoaded('children')) {
            $payload['children'] = $service->children->map(function (Service $child) use ($outletOverrides): array {
                /** @var OutletService|null $childOverride */
                $childOverride = $outletOverrides?->get((string) $child->id);

                return $this->serializeService($child, $childOverride, $outletOverrides, false);
            })->values()->all();
        }

        return $payload;
    }
}
