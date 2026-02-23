<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Outlet;
use App\Models\Promotion;
use App\Models\PromotionTarget;
use App\Models\PromotionVoucher;
use App\Models\Service;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

class PromotionController extends Controller
{
    use EnsuresApiAccess;

    private const PROMO_TYPES = ['selection', 'automatic', 'voucher'];

    private const PROMO_STATUSES = ['draft', 'active', 'inactive', 'expired'];

    private const STACK_MODES = ['exclusive', 'stackable'];

    private const SERVICE_TYPES = ['regular', 'package', 'perfume', 'item'];

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'string', Rule::in(self::PROMO_STATUSES)],
            'promo_type' => ['nullable', 'string', Rule::in(self::PROMO_TYPES)],
            'include_deleted' => ['nullable', 'boolean'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $includeDeleted = (bool) ($validated['include_deleted'] ?? false);
        if ($includeDeleted) {
            $this->ensureRole($user, ['owner', 'admin']);
        }

        $query = Promotion::query()
            ->where('tenant_id', $user->tenant_id)
            ->with(['targets', 'vouchers'])
            ->orderByDesc('updated_at');

        if ($includeDeleted) {
            $query->withTrashed();
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (! empty($validated['promo_type'])) {
            $query->where('promo_type', $validated['promo_type']);
        }

        $search = trim((string) ($validated['q'] ?? ''));
        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $limit = (int) ($validated['limit'] ?? 100);

        return response()->json([
            'data' => $query->limit($limit)->get()->map(fn (Promotion $promotion): array => $this->serializePromotion($promotion))->values(),
        ]);
    }

    public function sections(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'status' => ['nullable', 'string', Rule::in(['active', 'all', ...self::PROMO_STATUSES])],
        ]);

        $status = (string) ($validated['status'] ?? 'active');

        $query = Promotion::query()
            ->where('tenant_id', $user->tenant_id)
            ->with(['targets', 'vouchers'])
            ->orderByDesc('priority')
            ->orderByDesc('updated_at');

        if ($status !== 'all') {
            if ($status === 'active') {
                $query->where('status', 'active');
            } else {
                $query->where('status', $status);
            }
        }

        $promotions = $query->get();
        $grouped = $promotions->groupBy('promo_type');

        return response()->json([
            'data' => [
                'selection' => $this->mapPromotionSection($grouped->get('selection', collect())),
                'automatic' => $this->mapPromotionSection($grouped->get('automatic', collect())),
                'voucher' => $this->mapPromotionSection($grouped->get('voucher', collect())),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'promo_type' => ['required', 'string', Rule::in(self::PROMO_TYPES)],
            'name' => ['required', 'string', 'max:150'],
            'status' => ['nullable', 'string', Rule::in(self::PROMO_STATUSES)],
            'start_at' => ['nullable', 'date'],
            'end_at' => ['nullable', 'date', 'after_or_equal:start_at'],
            'priority' => ['nullable', 'integer', 'min:-1000', 'max:1000'],
            'stack_mode' => ['nullable', 'string', Rule::in(self::STACK_MODES)],
            'rule_json' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
            'targets' => ['nullable', 'array'],
            'targets.*.target_type' => ['required_with:targets', 'string', Rule::in(['service', 'service_type', 'outlet', 'all'])],
            'targets.*.target_id' => ['nullable'],
            'vouchers' => ['nullable', 'array'],
            'vouchers.*.code' => ['required_with:vouchers', 'string', 'max:60'],
            'vouchers.*.quota_total' => ['nullable', 'integer', 'min:1', 'max:1000000000'],
            'vouchers.*.per_customer_limit' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'vouchers.*.active' => ['nullable', 'boolean'],
            'vouchers.*.expires_at' => ['nullable', 'date'],
        ]);

        $name = trim((string) $validated['name']);
        if ($name === '') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama promo wajib diisi.',
            ], 422);
        }

        $targets = $this->normalizeTargets($validated['targets'] ?? [], $user);
        if ($targets === null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Target promo tidak valid.',
            ], 422);
        }

        $vouchers = $this->normalizeVouchers($validated['vouchers'] ?? [], (string) $validated['promo_type']);
        if ($vouchers === null) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Data voucher tidak valid.',
            ], 422);
        }

        $promotion = Promotion::query()->create([
            'tenant_id' => $user->tenant_id,
            'promo_type' => $validated['promo_type'],
            'name' => $name,
            'status' => $validated['status'] ?? 'draft',
            'start_at' => $validated['start_at'] ?? null,
            'end_at' => $validated['end_at'] ?? null,
            'priority' => (int) ($validated['priority'] ?? 0),
            'stack_mode' => $validated['stack_mode'] ?? 'exclusive',
            'rule_json' => $validated['rule_json'] ?? [],
            'notes' => $validated['notes'] ?? null,
        ]);

        $this->syncTargets($promotion, $targets);
        $this->syncVouchers($promotion, $vouchers);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PROMOTION_CREATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'promotion',
            entityId: (string) $promotion->id,
            metadata: [
                'name' => $promotion->name,
                'promo_type' => $promotion->promo_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializePromotion($promotion->fresh(['targets', 'vouchers'])),
        ], 201);
    }

    public function update(Request $request, Promotion $promotion): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($promotion->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested promotion.',
            ], 403);
        }

        $validated = $request->validate([
            'promo_type' => ['nullable', 'string', Rule::in(self::PROMO_TYPES)],
            'name' => ['nullable', 'string', 'max:150'],
            'status' => ['nullable', 'string', Rule::in(self::PROMO_STATUSES)],
            'start_at' => ['nullable', 'date'],
            'end_at' => ['nullable', 'date', 'after_or_equal:start_at'],
            'priority' => ['nullable', 'integer', 'min:-1000', 'max:1000'],
            'stack_mode' => ['nullable', 'string', Rule::in(self::STACK_MODES)],
            'rule_json' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
            'targets' => ['nullable', 'array'],
            'targets.*.target_type' => ['required_with:targets', 'string', Rule::in(['service', 'service_type', 'outlet', 'all'])],
            'targets.*.target_id' => ['nullable'],
            'vouchers' => ['nullable', 'array'],
            'vouchers.*.code' => ['required_with:vouchers', 'string', 'max:60'],
            'vouchers.*.quota_total' => ['nullable', 'integer', 'min:1', 'max:1000000000'],
            'vouchers.*.per_customer_limit' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'vouchers.*.active' => ['nullable', 'boolean'],
            'vouchers.*.expires_at' => ['nullable', 'date'],
        ]);

        $nextPromoType = (string) ($validated['promo_type'] ?? $promotion->promo_type);
        $nextName = trim((string) ($validated['name'] ?? $promotion->name));
        if ($nextName === '') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Nama promo wajib diisi.',
            ], 422);
        }

        $promotion->fill([
            'promo_type' => $nextPromoType,
            'name' => $nextName,
            'status' => $validated['status'] ?? $promotion->status,
            'start_at' => array_key_exists('start_at', $validated) ? $validated['start_at'] : $promotion->start_at,
            'end_at' => array_key_exists('end_at', $validated) ? $validated['end_at'] : $promotion->end_at,
            'priority' => array_key_exists('priority', $validated) ? (int) $validated['priority'] : (int) $promotion->priority,
            'stack_mode' => $validated['stack_mode'] ?? $promotion->stack_mode,
            'rule_json' => array_key_exists('rule_json', $validated) ? ($validated['rule_json'] ?? []) : ($promotion->rule_json ?? []),
            'notes' => array_key_exists('notes', $validated) ? $validated['notes'] : $promotion->notes,
        ])->save();

        if (array_key_exists('targets', $validated)) {
            $targets = $this->normalizeTargets($validated['targets'] ?? [], $user);
            if ($targets === null) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Target promo tidak valid.',
                ], 422);
            }
            $this->syncTargets($promotion, $targets);
        }

        if (array_key_exists('vouchers', $validated) || $nextPromoType !== 'voucher') {
            $vouchers = $this->normalizeVouchers($validated['vouchers'] ?? [], $nextPromoType);
            if ($vouchers === null) {
                return response()->json([
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => 'Data voucher tidak valid.',
                ], 422);
            }
            $this->syncVouchers($promotion, $vouchers);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PROMOTION_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'promotion',
            entityId: (string) $promotion->id,
            metadata: [
                'name' => $promotion->name,
                'promo_type' => $promotion->promo_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializePromotion($promotion->fresh(['targets', 'vouchers'])),
        ]);
    }

    public function destroy(Request $request, Promotion $promotion): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        if ($promotion->tenant_id !== $user->tenant_id) {
            return response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested promotion.',
            ], 403);
        }

        $promotion->delete();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PROMOTION_ARCHIVED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'promotion',
            entityId: (string) $promotion->id,
            metadata: [
                'name' => $promotion->name,
                'promo_type' => $promotion->promo_type,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'id' => (string) $promotion->id,
                'deleted_at' => $promotion->deleted_at?->toIso8601String(),
            ],
        ]);
    }

    /**
     * @param Collection<int, Promotion> $promotions
     * @return array<int, array<string, mixed>>
     */
    private function mapPromotionSection(Collection $promotions): array
    {
        return $promotions
            ->map(fn (Promotion $promotion): array => $this->serializePromotion($promotion))
            ->values()
            ->all();
    }

    private function serializePromotion(Promotion $promotion): array
    {
        return [
            'id' => (string) $promotion->id,
            'tenant_id' => (string) $promotion->tenant_id,
            'promo_type' => (string) $promotion->promo_type,
            'name' => (string) $promotion->name,
            'status' => (string) $promotion->status,
            'start_at' => $promotion->start_at?->toIso8601String(),
            'end_at' => $promotion->end_at?->toIso8601String(),
            'priority' => (int) $promotion->priority,
            'stack_mode' => (string) $promotion->stack_mode,
            'rule_json' => $promotion->rule_json ?? [],
            'notes' => $promotion->notes,
            'deleted_at' => $promotion->deleted_at?->toIso8601String(),
            'targets' => $promotion->relationLoaded('targets')
                ? $promotion->targets->map(fn (PromotionTarget $target): array => [
                    'id' => (string) $target->id,
                    'target_type' => (string) $target->target_type,
                    'target_id' => $target->target_id,
                ])->values()->all()
                : [],
            'vouchers' => $promotion->relationLoaded('vouchers')
                ? $promotion->vouchers->map(fn (PromotionVoucher $voucher): array => [
                    'id' => (string) $voucher->id,
                    'code' => (string) $voucher->code,
                    'quota_total' => $voucher->quota_total !== null ? (int) $voucher->quota_total : null,
                    'quota_used' => (int) $voucher->quota_used,
                    'per_customer_limit' => $voucher->per_customer_limit !== null ? (int) $voucher->per_customer_limit : null,
                    'active' => (bool) $voucher->active,
                    'expires_at' => $voucher->expires_at?->toIso8601String(),
                ])->values()->all()
                : [],
        ];
    }

    /**
     * @param array<int, mixed> $targets
     * @return array<int, array{target_type:string,target_id:?string}>|null
     */
    private function normalizeTargets(array $targets, User $user): ?array
    {
        $normalized = [];
        foreach ($targets as $target) {
            if (! is_array($target)) {
                return null;
            }

            $targetType = isset($target['target_type']) && is_string($target['target_type']) ? trim($target['target_type']) : '';
            $targetId = $target['target_id'] ?? null;

            if (! in_array($targetType, ['service', 'service_type', 'outlet', 'all'], true)) {
                return null;
            }

            if ($targetType === 'all') {
                $normalized[] = [
                    'target_type' => 'all',
                    'target_id' => null,
                ];
                continue;
            }

            if ($targetType === 'service_type') {
                if (! is_string($targetId) || ! in_array($targetId, self::SERVICE_TYPES, true)) {
                    return null;
                }

                $normalized[] = [
                    'target_type' => 'service_type',
                    'target_id' => $targetId,
                ];
                continue;
            }

            if (! is_string($targetId) || trim($targetId) === '') {
                return null;
            }

            $targetId = trim($targetId);
            if ($targetType === 'service') {
                $exists = Service::query()
                    ->where('tenant_id', $user->tenant_id)
                    ->where('id', $targetId)
                    ->exists();
                if (! $exists) {
                    return null;
                }
            }

            if ($targetType === 'outlet') {
                $exists = Outlet::query()
                    ->where('tenant_id', $user->tenant_id)
                    ->where('id', $targetId)
                    ->exists();
                if (! $exists) {
                    return null;
                }
            }

            $normalized[] = [
                'target_type' => $targetType,
                'target_id' => $targetId,
            ];
        }

        return $normalized;
    }

    /**
     * @param array<int, mixed> $vouchers
     * @return array<int, array{
     *     code:string,
     *     quota_total:?int,
     *     per_customer_limit:?int,
     *     active:bool,
     *     expires_at:?string
     * }>|null
     */
    private function normalizeVouchers(array $vouchers, string $promoType): ?array
    {
        if ($promoType !== 'voucher') {
            return [];
        }

        $normalized = [];
        foreach ($vouchers as $voucher) {
            if (! is_array($voucher)) {
                return null;
            }

            $code = isset($voucher['code']) && is_string($voucher['code']) ? strtoupper(trim($voucher['code'])) : '';
            if ($code === '') {
                return null;
            }

            $quotaTotal = isset($voucher['quota_total']) ? (int) $voucher['quota_total'] : null;
            $perCustomerLimit = isset($voucher['per_customer_limit']) ? (int) $voucher['per_customer_limit'] : null;
            $active = isset($voucher['active']) ? (bool) $voucher['active'] : true;
            $expiresAt = isset($voucher['expires_at']) && is_string($voucher['expires_at']) ? $voucher['expires_at'] : null;

            $normalized[] = [
                'code' => $code,
                'quota_total' => $quotaTotal,
                'per_customer_limit' => $perCustomerLimit,
                'active' => $active,
                'expires_at' => $expiresAt,
            ];
        }

        return $normalized;
    }

    /**
     * @param array<int, array{target_type:string,target_id:?string}> $targets
     */
    private function syncTargets(Promotion $promotion, array $targets): void
    {
        $promotion->targets()->delete();

        foreach ($targets as $target) {
            $promotion->targets()->create([
                'target_type' => $target['target_type'],
                'target_id' => $target['target_id'],
            ]);
        }
    }

    /**
     * @param array<int, array{
     *     code:string,
     *     quota_total:?int,
     *     per_customer_limit:?int,
     *     active:bool,
     *     expires_at:?string
     * }> $vouchers
     */
    private function syncVouchers(Promotion $promotion, array $vouchers): void
    {
        $promotion->vouchers()->delete();

        foreach ($vouchers as $voucher) {
            $promotion->vouchers()->create([
                'code' => $voucher['code'],
                'quota_total' => $voucher['quota_total'],
                'quota_used' => 0,
                'per_customer_limit' => $voucher['per_customer_limit'],
                'active' => $voucher['active'],
                'expires_at' => $voucher['expires_at'],
            ]);
        }
    }
}
