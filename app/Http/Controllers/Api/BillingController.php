<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\FinanceEntry;
use App\Models\TenantSubscription;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BillingController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly QuotaService $quotaService,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function quota(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
        ]);

        $period = $validated['period'] ?? now()->format('Y-m');
        $quota = $this->quotaService->snapshot($user->tenant_id, $period);

        $subscription = TenantSubscription::query()
            ->with('plan:id,key,name,orders_limit')
            ->where('tenant_id', $user->tenant_id)
            ->where('period', $period)
            ->first();

        return response()->json([
            'data' => [
                'quota' => $quota,
                'subscription' => $subscription ? [
                    'id' => $subscription->id,
                    'period' => $subscription->period,
                    'status' => $subscription->status,
                    'starts_at' => $subscription->starts_at?->toIso8601String(),
                    'ends_at' => $subscription->ends_at?->toIso8601String(),
                    'plan' => $subscription->plan ? [
                        'key' => $subscription->plan->key,
                        'name' => $subscription->plan->name,
                        'orders_limit' => $subscription->plan->orders_limit,
                    ] : null,
                ] : null,
            ],
        ]);
    }

    public function entries(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'type' => ['nullable', 'string', 'in:income,expense,adjustment'],
            'start_date' => ['nullable', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:start_date'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $this->ensureOutletAccess($user, $validated['outlet_id']);

        $baseQuery = $this->buildEntryQuery($user, $validated);
        $limit = $validated['limit'] ?? 50;

        $entries = (clone $baseQuery)
            ->with('creator:id,name')
            ->orderByDesc('entry_date')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        $summaryIncome = (int) (clone $baseQuery)
            ->where('type', 'income')
            ->sum('amount');

        $summaryExpense = (int) (clone $baseQuery)
            ->where('type', 'expense')
            ->sum('amount');

        $summaryAdjustment = (int) (clone $baseQuery)
            ->where('type', 'adjustment')
            ->sum('amount');

        return response()->json([
            'data' => $entries->map(fn (FinanceEntry $entry): array => $this->serializeEntry($entry))->all(),
            'meta' => [
                'summary' => [
                    'total_income' => $summaryIncome,
                    'total_expense' => $summaryExpense,
                    'total_adjustment' => $summaryAdjustment,
                    'net_amount' => $summaryIncome - $summaryExpense + $summaryAdjustment,
                    'entries_count' => (int) (clone $baseQuery)->count(),
                ],
                'filters' => [
                    'outlet_id' => $validated['outlet_id'],
                    'type' => $validated['type'] ?? null,
                    'start_date' => $validated['start_date'] ?? null,
                    'end_date' => $validated['end_date'] ?? null,
                    'limit' => $limit,
                ],
            ],
        ]);
    }

    public function storeEntry(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'type' => ['required', 'string', 'in:income,expense,adjustment'],
            'amount' => [
                'required',
                'integer',
                function (string $attribute, mixed $value, \Closure $fail) use ($request): void {
                    $amount = (int) $value;
                    $type = (string) $request->input('type');

                    if (in_array($type, ['income', 'expense'], true) && $amount <= 0) {
                        $fail('amount must be a positive integer for income/expense.');

                        return;
                    }

                    if ($type === 'adjustment' && $amount === 0) {
                        $fail('amount cannot be zero for adjustment.');

                        return;
                    }

                    if (abs($amount) > 1000000000) {
                        $fail('amount is too large.');
                    }
                },
            ],
            'category' => ['required', 'string', 'max:80'],
            'notes' => ['nullable', 'string', 'max:500'],
            'entry_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');

        $entry = FinanceEntry::query()->create([
            'tenant_id' => $user->tenant_id,
            'outlet_id' => $validated['outlet_id'],
            'entry_date' => $validated['entry_date'] ?? now()->toDateString(),
            'type' => $validated['type'],
            'amount' => (int) $validated['amount'],
            'category' => trim($validated['category']),
            'notes' => isset($validated['notes']) ? trim((string) $validated['notes']) : null,
            'created_by' => $user->id,
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ]);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::FINANCE_ENTRY_CREATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $entry->outlet_id,
            entityType: 'finance_entry',
            entityId: $entry->id,
            metadata: [
                'type' => $entry->type,
                'amount' => $entry->amount,
                'category' => $entry->category,
                'entry_date' => $entry->entry_date?->toDateString(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeEntry($entry->load('creator:id,name')),
        ], 201);
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function buildEntryQuery(User $user, array $validated): Builder
    {
        $query = FinanceEntry::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $validated['outlet_id']);

        if (isset($validated['type'])) {
            $query->where('type', $validated['type']);
        }

        if (isset($validated['start_date'])) {
            $query->whereDate('entry_date', '>=', $validated['start_date']);
        }

        if (isset($validated['end_date'])) {
            $query->whereDate('entry_date', '<=', $validated['end_date']);
        }

        return $query;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeEntry(FinanceEntry $entry): array
    {
        return [
            'id' => $entry->id,
            'tenant_id' => $entry->tenant_id,
            'outlet_id' => $entry->outlet_id,
            'entry_date' => $entry->entry_date?->toDateString(),
            'type' => $entry->type,
            'amount' => (int) $entry->amount,
            'category' => $entry->category,
            'notes' => $entry->notes,
            'created_by' => $entry->created_by,
            'created_by_name' => $entry->creator?->name,
            'source_channel' => $entry->source_channel,
            'created_at' => $entry->created_at?->toIso8601String(),
            'updated_at' => $entry->updated_at?->toIso8601String(),
        ];
    }

    private function resolveSourceChannel(Request $request, string $fallback = 'web'): string
    {
        $raw = strtolower((string) $request->header('X-Source-Channel', $fallback));

        return in_array($raw, ['mobile', 'web', 'system'], true) ? $raw : $fallback;
    }
}
