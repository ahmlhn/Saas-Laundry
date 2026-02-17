<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaService;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Order;
use App\Models\Outlet;
use App\Models\Payment;
use App\Models\QuotaUsage;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use Symfony\Component\HttpFoundation\StreamedResponse;

class BillingController extends Controller
{
    use EnsuresWebPanelAccess;

    /**
     * @var array<int, string>
     */
    private const COLLECTION_STATUSES = [
        'pending',
        'contacted',
        'promise_to_pay',
        'escalated',
        'resolved',
    ];

    public function __construct(
        private readonly QuotaService $quotaService,
        private readonly AuditTrailService $auditTrailService,
    ) {
    }

    public function index(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
            'outlet_id' => ['nullable', 'uuid'],
            'payment_status' => ['nullable', 'string', 'in:paid,partial,unpaid'],
            'aging_bucket' => ['nullable', 'string', 'in:d0_7,d8_14,d15_30,d31_plus'],
            'collection_status' => ['nullable', 'string', 'in:pending,contacted,promise_to_pay,escalated,resolved'],
            'cash_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $viewData = $this->buildBillingViewData(
            user: $user,
            tenant: $tenant,
            period: $validated['period'] ?? now()->format('Y-m'),
            selectedOutletId: $validated['outlet_id'] ?? null,
            selectedPaymentStatus: $validated['payment_status'] ?? null,
            selectedAgingBucket: $validated['aging_bucket'] ?? null,
            selectedCollectionStatus: $validated['collection_status'] ?? null,
            cashDate: $validated['cash_date'] ?? now()->format('Y-m-d'),
        );

        return view('web.billing.index', array_merge([
            'tenant' => $tenant,
            'user' => $user,
        ], $viewData));
    }

    public function export(Request $request, Tenant $tenant): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'period' => ['nullable', 'date_format:Y-m'],
            'dataset' => ['nullable', 'string', 'in:outlets,usage,orders,aging,aging_details,cash_daily'],
            'outlet_id' => ['nullable', 'uuid'],
            'payment_status' => ['nullable', 'string', 'in:paid,partial,unpaid'],
            'aging_bucket' => ['nullable', 'string', 'in:d0_7,d8_14,d15_30,d31_plus'],
            'collection_status' => ['nullable', 'string', 'in:pending,contacted,promise_to_pay,escalated,resolved'],
            'cash_date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $dataset = $validated['dataset'] ?? 'outlets';
        $viewData = $this->buildBillingViewData(
            user: $user,
            tenant: $tenant,
            period: $validated['period'] ?? now()->format('Y-m'),
            selectedOutletId: $validated['outlet_id'] ?? null,
            selectedPaymentStatus: $validated['payment_status'] ?? null,
            selectedAgingBucket: $validated['aging_bucket'] ?? null,
            selectedCollectionStatus: $validated['collection_status'] ?? null,
            cashDate: $validated['cash_date'] ?? now()->format('Y-m-d'),
            includeOrderDetails: $dataset === 'orders',
        );

        $filename = $this->buildExportFilename(
            tenantId: $tenant->id,
            dataset: $dataset,
            period: $viewData['period'],
            cashDate: $viewData['cashDate'],
        );

        return response()->streamDownload(function () use ($dataset, $viewData): void {
            $this->writeExportCsv($dataset, $viewData);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function updateCollection(Request $request, Tenant $tenant, Order $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        if ($order->tenant_id !== $tenant->id) {
            abort(404);
        }

        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);
        if (! in_array((string) $order->outlet_id, $allowedOutletIds, true)) {
            abort(403, 'Outlet access denied.');
        }

        $validated = $request->validate([
            'collection_status' => ['required', 'string', 'in:pending,contacted,promise_to_pay,escalated,resolved'],
            'collection_next_follow_up_at' => ['nullable', 'date'],
            'collection_note' => ['nullable', 'string', 'max:500'],
        ]);

        $nextFollowUpAt = array_key_exists('collection_next_follow_up_at', $validated) && $validated['collection_next_follow_up_at']
            ? Carbon::parse((string) $validated['collection_next_follow_up_at'])->seconds(0)
            : null;
        $collectionNote = trim((string) ($validated['collection_note'] ?? ''));

        $order->forceFill([
            'collection_status' => (string) $validated['collection_status'],
            'collection_last_contacted_at' => now(),
            'collection_next_follow_up_at' => $nextFollowUpAt,
            'collection_note' => $collectionNote === '' ? null : $collectionNote,
            'updated_by' => $user->id,
            'source_channel' => 'web',
        ])->save();

        $this->auditTrailService->record(
            eventKey: AuditEventKeys::ORDER_COLLECTION_UPDATED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: (string) $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'collection_status' => $order->collection_status,
                'collection_next_follow_up_at' => $order->collection_next_follow_up_at?->toIso8601String(),
                'collection_note' => $order->collection_note,
            ],
            channel: 'web',
            request: $request,
        );

        return back()->with('status', 'Tindak lanjut penagihan berhasil diperbarui.');
    }

    private function buildBillingViewData(
        User $user,
        Tenant $tenant,
        string $period,
        ?string $selectedOutletId = null,
        ?string $selectedPaymentStatus = null,
        ?string $selectedAgingBucket = null,
        ?string $selectedCollectionStatus = null,
        ?string $cashDate = null,
        bool $includeOrderDetails = false,
    ): array {
        $tenant->loadMissing('currentPlan:id,key,orders_limit');

        $periodStart = Carbon::createFromFormat('Y-m', $period)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();
        $cashDate = $cashDate ?: now()->format('Y-m-d');
        $cashDateStart = Carbon::createFromFormat('Y-m-d', $cashDate)->startOfDay();
        $cashDateEnd = $cashDateStart->copy()->endOfDay();

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $availableOutletsQuery = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name');

        if (! $ownerMode) {
            $availableOutletsQuery->whereIn('id', $allowedOutletIds);
        }

        $availableOutlets = $availableOutletsQuery->get(['id', 'name', 'code']);

        if ($selectedOutletId && ! $availableOutlets->pluck('id')->contains($selectedOutletId)) {
            throw ValidationException::withMessages([
                'billing' => ['Outlet filter tidak valid atau di luar scope Anda.'],
            ]);
        }

        $selectedOutlet = $selectedOutletId
            ? $availableOutlets->firstWhere('id', $selectedOutletId)
            : null;
        $selectedOutletLabel = $selectedOutlet?->name ?: 'Semua Outlet Scope';
        $selectedPaymentStatusLabel = $this->paymentStatusLabel($selectedPaymentStatus);
        $selectedAgingBucketLabel = $this->agingBucketLabel($selectedAgingBucket);
        $selectedCollectionStatusLabel = $this->collectionStatusLabel($selectedCollectionStatus);

        $ordersInScope = Order::query()
            ->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $ordersInScope->whereIn('outlet_id', $allowedOutletIds);
        }

        if ($selectedOutletId) {
            $ordersInScope->where('outlet_id', $selectedOutletId);
        }

        $this->applyPaymentStatusOrderFilter($ordersInScope, $selectedPaymentStatus);

        $ordersSelectedPeriod = (clone $ordersInScope)
            ->whereBetween('created_at', [$periodStart, $periodEnd]);

        $ordersCount = (int) (clone $ordersSelectedPeriod)->count();
        $grossAmount = (int) (clone $ordersSelectedPeriod)->sum('total_amount');
        $outstandingAmount = (int) (clone $ordersSelectedPeriod)->sum('due_amount');

        $paidAmount = (int) Payment::query()
            ->whereBetween('paid_at', [$periodStart, $periodEnd])
            ->whereHas('order', function ($query) use ($tenant, $ownerMode, $allowedOutletIds, $selectedOutletId, $selectedPaymentStatus): void {
                $query->where('tenant_id', $tenant->id);

                if (! $ownerMode) {
                    $query->whereIn('outlet_id', $allowedOutletIds);
                }

                if ($selectedOutletId) {
                    $query->where('outlet_id', $selectedOutletId);
                }

                $this->applyPaymentStatusOrderFilter($query, $selectedPaymentStatus);
            })
            ->sum('amount');

        $quota = $this->quotaService->snapshot($tenant->id, $period);
        $usagePercent = is_null($quota['orders_limit'])
            ? null
            : (int) min(100, round(($quota['orders_used'] / max((int) $quota['orders_limit'], 1)) * 100));

        $subscription = TenantSubscription::query()
            ->with('plan:id,key,name,orders_limit')
            ->where('tenant_id', $tenant->id)
            ->where('period', $period)
            ->first();

        $historyPeriods = collect(range(5, 0))
            ->map(fn (int $monthOffset): string => $periodStart->copy()->subMonths($monthOffset)->format('Y-m'))
            ->values();

        $historyStart = Carbon::createFromFormat('Y-m', (string) $historyPeriods->first())->startOfMonth();
        $historyEnd = Carbon::createFromFormat('Y-m', (string) $historyPeriods->last())->endOfMonth();

        $usageByPeriod = QuotaUsage::query()
            ->where('tenant_id', $tenant->id)
            ->whereIn('period', $historyPeriods->all())
            ->get(['period', 'orders_used'])
            ->keyBy('period');

        $subscriptionByPeriod = TenantSubscription::query()
            ->with('plan:id,key,name,orders_limit')
            ->where('tenant_id', $tenant->id)
            ->whereIn('period', $historyPeriods->all())
            ->get()
            ->keyBy('period');

        $orderCountByPeriod = (clone $ordersInScope)
            ->whereBetween('created_at', [$historyStart, $historyEnd])
            ->get(['created_at'])
            ->groupBy(fn (Order $order): string => (string) $order->created_at?->format('Y-m'))
            ->map(fn ($rows): int => (int) $rows->count());

        $paidAmountByPeriod = Payment::query()
            ->whereBetween('paid_at', [$historyStart, $historyEnd])
            ->whereHas('order', function ($query) use ($tenant, $ownerMode, $allowedOutletIds, $selectedOutletId, $selectedPaymentStatus): void {
                $query->where('tenant_id', $tenant->id);

                if (! $ownerMode) {
                    $query->whereIn('outlet_id', $allowedOutletIds);
                }

                if ($selectedOutletId) {
                    $query->where('outlet_id', $selectedOutletId);
                }

                $this->applyPaymentStatusOrderFilter($query, $selectedPaymentStatus);
            })
            ->get(['paid_at', 'amount'])
            ->groupBy(fn (Payment $payment): string => (string) $payment->paid_at?->format('Y-m'))
            ->map(fn ($rows): int => (int) $rows->sum('amount'));

        $usageHistory = $historyPeriods
            ->map(function (string $monthPeriod) use ($subscriptionByPeriod, $usageByPeriod, $orderCountByPeriod, $paidAmountByPeriod, $quota, $tenant): array {
                $subscriptionRow = $subscriptionByPeriod->get($monthPeriod);
                $ordersLimit = $subscriptionRow?->plan?->orders_limit;

                if (is_null($ordersLimit) && $monthPeriod === $quota['period']) {
                    $ordersLimit = $quota['orders_limit'];
                }

                if (is_null($ordersLimit)) {
                    $ordersLimit = $tenant->currentPlan?->orders_limit;
                }

                $ordersUsed = (int) ($usageByPeriod->get($monthPeriod)?->orders_used ?? 0);
                $remaining = is_null($ordersLimit)
                    ? null
                    : max((int) $ordersLimit - $ordersUsed, 0);
                $periodUsagePercent = is_null($ordersLimit)
                    ? null
                    : (int) min(100, round(($ordersUsed / max((int) $ordersLimit, 1)) * 100));

                return [
                    'period' => $monthPeriod,
                    'label' => Carbon::createFromFormat('Y-m', $monthPeriod)->translatedFormat('M Y'),
                    'orders_limit' => $ordersLimit,
                    'orders_used' => $ordersUsed,
                    'orders_remaining' => $remaining,
                    'usage_percent' => $periodUsagePercent,
                    'orders_count' => (int) ($orderCountByPeriod->get($monthPeriod) ?? 0),
                    'paid_amount' => (int) ($paidAmountByPeriod->get($monthPeriod) ?? 0),
                ];
            })
            ->values();

        $outletSummaryRows = (clone $ordersSelectedPeriod)
            ->selectRaw('outlet_id, COUNT(*) as orders_count, COALESCE(SUM(total_amount), 0) as gross_amount, COALESCE(SUM(due_amount), 0) as due_amount')
            ->groupBy('outlet_id')
            ->orderByDesc('gross_amount')
            ->get();

        $outletNameMap = Outlet::query()
            ->whereIn('id', $outletSummaryRows->pluck('outlet_id')->filter()->all())
            ->pluck('name', 'id');

        $outletPaidAmountMapQuery = Payment::query()
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->where('orders.tenant_id', $tenant->id)
            ->whereBetween('payments.paid_at', [$periodStart, $periodEnd]);

        if (! $ownerMode) {
            $outletPaidAmountMapQuery->whereIn('orders.outlet_id', $allowedOutletIds);
        }

        if ($selectedOutletId) {
            $outletPaidAmountMapQuery->where('orders.outlet_id', $selectedOutletId);
        }

        $this->applyPaymentStatusOrderFilter($outletPaidAmountMapQuery, $selectedPaymentStatus, 'orders');

        $outletPaidAmountMap = $outletPaidAmountMapQuery
            ->selectRaw('orders.outlet_id as outlet_id, COALESCE(SUM(payments.amount), 0) as paid_amount')
            ->groupBy('orders.outlet_id')
            ->pluck('paid_amount', 'outlet_id');

        $outletSummary = $outletSummaryRows
            ->map(fn ($row): array => [
                'outlet_id' => (string) $row->outlet_id,
                'outlet_name' => (string) ($outletNameMap[$row->outlet_id] ?? 'Outlet'),
                'orders_count' => (int) $row->orders_count,
                'gross_amount' => (int) $row->gross_amount,
                'paid_amount' => (int) ($outletPaidAmountMap[$row->outlet_id] ?? 0),
                'due_amount' => (int) $row->due_amount,
            ])
            ->values();

        $orderDetails = collect();
        if ($includeOrderDetails) {
            $orderDetails = (clone $ordersSelectedPeriod)
                ->with(['outlet:id,name,code', 'customer:id,name,phone_normalized'])
                ->orderByDesc('created_at')
                ->get([
                    'id',
                    'outlet_id',
                    'customer_id',
                    'invoice_no',
                    'order_code',
                    'is_pickup_delivery',
                    'laundry_status',
                    'courier_status',
                    'total_amount',
                    'paid_amount',
                    'due_amount',
                    'created_at',
                ])
                ->map(fn (Order $order): array => [
                    'period' => $period,
                    'outlet_id' => (string) $order->outlet_id,
                    'outlet_code' => (string) ($order->outlet?->code ?? '-'),
                    'outlet_name' => (string) ($order->outlet?->name ?? 'Outlet'),
                    'invoice_or_order_code' => (string) ($order->invoice_no ?: $order->order_code),
                    'order_code' => (string) $order->order_code,
                    'customer_name' => (string) ($order->customer?->name ?? '-'),
                    'customer_phone' => (string) ($order->customer?->phone_normalized ?? '-'),
                    'is_pickup_delivery' => $order->is_pickup_delivery ? 'yes' : 'no',
                    'laundry_status' => (string) ($order->laundry_status ?? '-'),
                    'courier_status' => (string) ($order->courier_status ?? '-'),
                    'total_amount' => (int) $order->total_amount,
                    'paid_amount' => (int) $order->paid_amount,
                    'due_amount' => (int) $order->due_amount,
                    'created_at' => $order->created_at?->format('Y-m-d H:i:s') ?? '-',
                ])
                ->values();
        }

        $agingRowsQuery = (clone $ordersInScope)
            ->where('due_amount', '>', 0);
        $this->applyCollectionStatusOrderFilter($agingRowsQuery, $selectedCollectionStatus);

        $agingRows = $agingRowsQuery
            ->with(['outlet:id,name,code', 'customer:id,name,phone_normalized'])
            ->orderByDesc('created_at')
            ->get([
                'id',
                'outlet_id',
                'customer_id',
                'invoice_no',
                'order_code',
                'due_amount',
                'created_at',
                'collection_status',
                'collection_last_contacted_at',
                'collection_next_follow_up_at',
                'collection_note',
            ]);

        $currentDay = now()->startOfDay();
        $agingOrderDetailsAll = $agingRows
            ->map(function (Order $order) use ($period, $currentDay): array {
                $ageDays = Carbon::parse($order->created_at)->startOfDay()->diffInDays($currentDay);
                $bucketKey = $this->agingBucketKey($ageDays);
                $collectionStatus = $this->normalizeCollectionStatus($order);
                $nextFollowUpAt = $order->collection_next_follow_up_at;

                return [
                    'order_id' => (string) $order->id,
                    'period' => $period,
                    'bucket_key' => $bucketKey,
                    'bucket_label' => $this->agingBucketLabel($bucketKey),
                    'age_days' => $ageDays,
                    'outlet_id' => (string) $order->outlet_id,
                    'outlet_code' => (string) ($order->outlet?->code ?? '-'),
                    'outlet_name' => (string) ($order->outlet?->name ?? 'Outlet'),
                    'invoice_or_order_code' => (string) ($order->invoice_no ?: $order->order_code),
                    'order_code' => (string) $order->order_code,
                    'customer_name' => (string) ($order->customer?->name ?? '-'),
                    'customer_phone' => (string) ($order->customer?->phone_normalized ?? '-'),
                    'due_amount' => (int) $order->due_amount,
                    'collection_status' => $collectionStatus,
                    'collection_status_label' => $this->collectionStatusLabel($collectionStatus),
                    'collection_last_contacted_at' => $order->collection_last_contacted_at?->format('Y-m-d H:i') ?? '-',
                    'collection_next_follow_up_at' => $nextFollowUpAt?->format('Y-m-d H:i') ?? '-',
                    'collection_next_follow_up_at_input' => $nextFollowUpAt?->format('Y-m-d\TH:i') ?? '',
                    'collection_note' => (string) ($order->collection_note ?? ''),
                    'collection_follow_up_due' => (bool) ($nextFollowUpAt && $nextFollowUpAt->lessThanOrEqualTo(now())),
                    'created_at' => $order->created_at?->format('Y-m-d H:i:s') ?? '-',
                ];
            });

        $agingOrderDetails = $selectedAgingBucket
            ? $agingOrderDetailsAll->where('bucket_key', $selectedAgingBucket)->values()
            : $agingOrderDetailsAll->values();

        $agingOutstandingOrders = (int) $agingOrderDetails->count();
        $agingOutstandingAmount = (int) $agingOrderDetails->sum('due_amount');
        $agingSummary = $this->buildAgingSummary($agingOrderDetails, $agingOutstandingAmount, $selectedAgingBucket);
        $collectionFollowUpDueCount = (int) $agingOrderDetails->where('collection_follow_up_due', true)->count();
        $collectionFollowUpDueAmount = (int) $agingOrderDetails->where('collection_follow_up_due', true)->sum('due_amount');

        $cashPayments = Payment::query()
            ->whereBetween('paid_at', [$cashDateStart, $cashDateEnd])
            ->whereHas('order', function ($query) use ($tenant, $ownerMode, $allowedOutletIds, $selectedOutletId, $selectedPaymentStatus): void {
                $query->where('tenant_id', $tenant->id);

                if (! $ownerMode) {
                    $query->whereIn('outlet_id', $allowedOutletIds);
                }

                if ($selectedOutletId) {
                    $query->where('outlet_id', $selectedOutletId);
                }

                $this->applyPaymentStatusOrderFilter($query, $selectedPaymentStatus);
            })
            ->with([
                'order:id,outlet_id,invoice_no,order_code,due_amount',
                'order.outlet:id,name,code',
            ])
            ->orderByDesc('paid_at')
            ->get(['id', 'order_id', 'amount', 'method', 'paid_at', 'notes']);

        $cashDailyDetails = $cashPayments
            ->map(function (Payment $payment) use ($cashDate): array {
                $method = strtolower(trim((string) $payment->method));

                return [
                    'date' => $cashDate,
                    'paid_at' => $payment->paid_at?->format('Y-m-d H:i:s') ?? '-',
                    'outlet_id' => (string) ($payment->order?->outlet_id ?? ''),
                    'outlet_code' => (string) ($payment->order?->outlet?->code ?? ''),
                    'outlet_name' => (string) ($payment->order?->outlet?->name ?? 'Outlet'),
                    'invoice_or_order_code' => (string) ($payment->order?->invoice_no ?: $payment->order?->order_code ?: '-'),
                    'order_code' => (string) ($payment->order?->order_code ?? '-'),
                    'payment_method' => $method === '' ? 'other' : $method,
                    'payment_amount' => (int) $payment->amount,
                    'order_due_amount' => (int) ($payment->order?->due_amount ?? 0),
                    'notes' => (string) ($payment->notes ?? ''),
                ];
            })
            ->values();

        $cashCollected = (int) $cashDailyDetails->sum('payment_amount');
        $cashCollectedTunai = (int) $cashDailyDetails
            ->filter(fn (array $row): bool => in_array($row['payment_method'], ['cash', 'tunai'], true))
            ->sum('payment_amount');
        $cashMethodSummary = $cashDailyDetails
            ->groupBy('payment_method')
            ->map(function ($rows, string $method): array {
                return [
                    'method' => $method,
                    'label' => $this->paymentMethodLabel($method),
                    'transactions_count' => $rows->count(),
                    'amount' => (int) $rows->sum('payment_amount'),
                ];
            })
            ->sortByDesc('amount')
            ->values();

        $cashReconciliation = [
            'date' => $cashDate,
            'transactions_count' => (int) $cashDailyDetails->count(),
            'outlets_count' => (int) $cashDailyDetails->pluck('outlet_id')->filter()->unique()->count(),
            'total_collected' => $cashCollected,
            'cash_collected' => $cashCollectedTunai,
            'non_cash_collected' => max($cashCollected - $cashCollectedTunai, 0),
            'outstanding_orders' => (int) (clone $ordersInScope)->where('due_amount', '>', 0)->count(),
            'outstanding_amount' => (int) (clone $ordersInScope)->where('due_amount', '>', 0)->sum('due_amount'),
        ];

        return [
            'period' => $period,
            'cashDate' => $cashDate,
            'ownerMode' => $ownerMode,
            'selectedOutletId' => $selectedOutletId,
            'selectedOutletLabel' => $selectedOutletLabel,
            'selectedPaymentStatus' => $selectedPaymentStatus,
            'selectedPaymentStatusLabel' => $selectedPaymentStatusLabel,
            'selectedAgingBucket' => $selectedAgingBucket,
            'selectedAgingBucketLabel' => $selectedAgingBucketLabel,
            'selectedCollectionStatus' => $selectedCollectionStatus,
            'selectedCollectionStatusLabel' => $selectedCollectionStatusLabel,
            'availableOutlets' => $availableOutlets,
            'quota' => $quota,
            'usagePercent' => $usagePercent,
            'ordersCount' => $ordersCount,
            'grossAmount' => $grossAmount,
            'paidAmount' => $paidAmount,
            'outstandingAmount' => $outstandingAmount,
            'subscription' => $subscription,
            'usageHistory' => $usageHistory,
            'outletSummary' => $outletSummary,
            'agingOutstandingOrders' => $agingOutstandingOrders,
            'agingOutstandingAmount' => $agingOutstandingAmount,
            'agingSummary' => $agingSummary,
            'agingOrderDetails' => $agingOrderDetails,
            'collectionFollowUpDueCount' => $collectionFollowUpDueCount,
            'collectionFollowUpDueAmount' => $collectionFollowUpDueAmount,
            'cashReconciliation' => $cashReconciliation,
            'cashMethodSummary' => $cashMethodSummary,
            'cashDailyDetails' => $cashDailyDetails,
            'orderDetails' => $orderDetails,
        ];
    }

    private function buildExportFilename(string $tenantId, string $dataset, string $period, string $cashDate): string
    {
        $fileSuffix = match ($dataset) {
            'usage' => 'usage-history',
            'orders' => 'order-details',
            'aging' => 'invoice-aging',
            'aging_details' => 'invoice-aging-details',
            'cash_daily' => 'cash-daily',
            default => 'outlet-summary',
        };

        return sprintf(
            'billing-%s-%s-%s.csv',
            $tenantId,
            $dataset === 'cash_daily' ? $cashDate : $period,
            $fileSuffix,
        );
    }

    /**
     * @param array<string, mixed> $viewData
     */
    private function writeExportCsv(string $dataset, array $viewData): void
    {
        $handle = fopen('php://output', 'wb');

        if ($handle === false) {
            return;
        }

        fwrite($handle, "\xEF\xBB\xBF");

        if ($dataset === 'usage') {
            $this->writeCsvRows(
                $handle,
                ['period', 'label', 'orders_limit', 'orders_used', 'orders_remaining', 'usage_percent', 'orders_count', 'paid_amount'],
                $viewData['usageHistory'] ?? [],
            );
            fclose($handle);

            return;
        }

        if ($dataset === 'aging') {
            $this->writeCsvRows(
                $handle,
                ['period', 'bucket_key', 'bucket_label', 'orders_count', 'due_amount', 'due_percent'],
                collect($viewData['agingSummary'] ?? [])->map(function (array $row) use ($viewData): array {
                    return array_merge(['period' => $viewData['period']], $row);
                }),
                [
                    'period' => $viewData['period'],
                    'bucket_key' => 'no_data',
                    'bucket_label' => 'Tidak ada data',
                    'orders_count' => 0,
                    'due_amount' => 0,
                    'due_percent' => 0,
                ],
            );
            fclose($handle);

            return;
        }

        if ($dataset === 'aging_details') {
            $this->writeCsvRows(
                $handle,
                [
                    'period',
                    'bucket_key',
                    'bucket_label',
                    'age_days',
                    'outlet_id',
                    'outlet_code',
                    'outlet_name',
                    'invoice_or_order_code',
                    'order_code',
                    'customer_name',
                    'customer_phone',
                    'due_amount',
                    'collection_status',
                    'collection_last_contacted_at',
                    'collection_next_follow_up_at',
                    'collection_note',
                    'created_at',
                ],
                $viewData['agingOrderDetails'] ?? [],
                [
                    'period' => $viewData['period'],
                    'bucket_key' => 'no_data',
                    'bucket_label' => 'Tidak ada data',
                    'age_days' => 0,
                    'outlet_id' => '',
                    'outlet_code' => '',
                    'outlet_name' => '-',
                    'invoice_or_order_code' => '-',
                    'order_code' => '-',
                    'customer_name' => '-',
                    'customer_phone' => '-',
                    'due_amount' => 0,
                    'collection_status' => 'pending',
                    'collection_last_contacted_at' => '-',
                    'collection_next_follow_up_at' => '-',
                    'collection_note' => '',
                    'created_at' => '-',
                ],
            );
            fclose($handle);

            return;
        }

        if ($dataset === 'orders') {
            $this->writeCsvRows(
                $handle,
                [
                    'period',
                    'outlet_id',
                    'outlet_code',
                    'outlet_name',
                    'invoice_or_order_code',
                    'order_code',
                    'customer_name',
                    'customer_phone',
                    'is_pickup_delivery',
                    'laundry_status',
                    'courier_status',
                    'total_amount',
                    'paid_amount',
                    'due_amount',
                    'created_at',
                ],
                $viewData['orderDetails'] ?? [],
                [
                    'period' => $viewData['period'],
                    'outlet_id' => '',
                    'outlet_code' => '',
                    'outlet_name' => '-',
                    'invoice_or_order_code' => '-',
                    'order_code' => '-',
                    'customer_name' => '-',
                    'customer_phone' => '-',
                    'is_pickup_delivery' => 'no',
                    'laundry_status' => '-',
                    'courier_status' => '-',
                    'total_amount' => 0,
                    'paid_amount' => 0,
                    'due_amount' => 0,
                    'created_at' => '-',
                ],
            );
            fclose($handle);

            return;
        }

        if ($dataset === 'cash_daily') {
            $this->writeCsvRows(
                $handle,
                [
                    'date',
                    'paid_at',
                    'outlet_id',
                    'outlet_code',
                    'outlet_name',
                    'invoice_or_order_code',
                    'order_code',
                    'payment_method',
                    'payment_amount',
                    'order_due_amount',
                    'notes',
                ],
                $viewData['cashDailyDetails'] ?? [],
                [
                    'date' => $viewData['cashDate'],
                    'paid_at' => '-',
                    'outlet_id' => '',
                    'outlet_code' => '',
                    'outlet_name' => '-',
                    'invoice_or_order_code' => '-',
                    'order_code' => '-',
                    'payment_method' => '-',
                    'payment_amount' => 0,
                    'order_due_amount' => 0,
                    'notes' => '',
                ],
            );
            fclose($handle);

            return;
        }

        $outletRows = collect($viewData['outletSummary'] ?? [])
            ->map(function (array $row) use ($viewData): array {
                return [
                    'period' => $viewData['period'],
                    'plan' => $viewData['quota']['plan'] ?? null,
                    'orders_limit' => $viewData['quota']['orders_limit'] ?? null,
                    'orders_used' => $viewData['quota']['orders_used'] ?? 0,
                    'orders_remaining' => $viewData['quota']['orders_remaining'] ?? null,
                    'can_create_order' => ($viewData['quota']['can_create_order'] ?? false) ? 'yes' : 'no',
                    'outlet_id' => $row['outlet_id'] ?? '',
                    'outlet_name' => $row['outlet_name'] ?? '-',
                    'orders_count' => $row['orders_count'] ?? 0,
                    'gross_amount' => $row['gross_amount'] ?? 0,
                    'paid_amount' => $row['paid_amount'] ?? 0,
                    'due_amount' => $row['due_amount'] ?? 0,
                ];
            });

        $this->writeCsvRows(
            $handle,
            [
                'period',
                'plan',
                'orders_limit',
                'orders_used',
                'orders_remaining',
                'can_create_order',
                'outlet_id',
                'outlet_name',
                'orders_count',
                'gross_amount',
                'paid_amount',
                'due_amount',
            ],
            $outletRows,
            [
                'period' => $viewData['period'],
                'plan' => $viewData['quota']['plan'] ?? null,
                'orders_limit' => $viewData['quota']['orders_limit'] ?? null,
                'orders_used' => $viewData['quota']['orders_used'] ?? 0,
                'orders_remaining' => $viewData['quota']['orders_remaining'] ?? null,
                'can_create_order' => ($viewData['quota']['can_create_order'] ?? false) ? 'yes' : 'no',
                'outlet_id' => '',
                'outlet_name' => '-',
                'orders_count' => 0,
                'gross_amount' => 0,
                'paid_amount' => 0,
                'due_amount' => 0,
            ],
        );

        fclose($handle);
    }

    private function writeCsvRows($handle, array $header, $rows, ?array $emptyRow = null): void
    {
        fputcsv($handle, $header);

        $rows = collect($rows);

        if ($rows->isEmpty() && is_array($emptyRow)) {
            $rows = collect([$emptyRow]);
        }

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $values = [];
            foreach ($header as $column) {
                $values[] = $row[$column] ?? null;
            }

            fputcsv($handle, $values);
        }
    }

    private function applyPaymentStatusOrderFilter(Builder $query, ?string $paymentStatus, ?string $table = null): void
    {
        $dueAmountColumn = $table ? $table.'.due_amount' : 'due_amount';
        $paidAmountColumn = $table ? $table.'.paid_amount' : 'paid_amount';

        if ($paymentStatus === 'paid') {
            $query->where($dueAmountColumn, '=', 0);

            return;
        }

        if ($paymentStatus === 'partial') {
            $query->where($paidAmountColumn, '>', 0)
                ->where($dueAmountColumn, '>', 0);

            return;
        }

        if ($paymentStatus === 'unpaid') {
            $query->where($paidAmountColumn, '=', 0)
                ->where($dueAmountColumn, '>', 0);
        }
    }

    private function applyCollectionStatusOrderFilter(Builder $query, ?string $collectionStatus, ?string $table = null): void
    {
        if (! $collectionStatus) {
            return;
        }

        $column = $table ? $table.'.collection_status' : 'collection_status';

        if ($collectionStatus === 'pending') {
            $query->where(function (Builder $builder) use ($column): void {
                $builder->whereNull($column)
                    ->orWhere($column, 'pending');
            });

            return;
        }

        $query->where($column, '=', $collectionStatus);
    }

    private function paymentStatusLabel(?string $paymentStatus): string
    {
        return match ($paymentStatus) {
            'paid' => 'Lunas',
            'partial' => 'Sebagian',
            'unpaid' => 'Belum Bayar',
            default => 'Semua Status Pembayaran',
        };
    }

    private function collectionStatusLabel(?string $collectionStatus): string
    {
        return match ($collectionStatus) {
            'pending' => 'Belum Ditindaklanjuti',
            'contacted' => 'Sudah Dihubungi',
            'promise_to_pay' => 'Janji Bayar',
            'escalated' => 'Eskalasi',
            'resolved' => 'Selesai',
            default => 'Semua Status Penagihan',
        };
    }

    private function paymentMethodLabel(string $method): string
    {
        return match ($method) {
            'cash', 'tunai' => 'Tunai',
            'transfer' => 'Transfer',
            'qris' => 'QRIS',
            'ewallet' => 'E-Wallet',
            'card' => 'Kartu',
            default => strtoupper($method),
        };
    }

    private function normalizeCollectionStatus(Order $order): string
    {
        $status = (string) ($order->collection_status ?? '');

        if ($status === '' || ! in_array($status, self::COLLECTION_STATUSES, true)) {
            return 'pending';
        }

        return $status;
    }

    private function buildAgingSummary($agingOrderDetails, int $totalDueAmount, ?string $selectedAgingBucket = null)
    {
        $bucketKeys = $selectedAgingBucket
            ? [$selectedAgingBucket]
            : ['d0_7', 'd8_14', 'd15_30', 'd31_plus'];

        $bucketStats = collect($bucketKeys)
            ->mapWithKeys(fn (string $bucketKey): array => [
                $bucketKey => [
                    'bucket_key' => $bucketKey,
                    'bucket_label' => $this->agingBucketLabel($bucketKey),
                    'orders_count' => 0,
                    'due_amount' => 0,
                    'due_percent' => 0,
                ],
            ])
            ->all();

        foreach ($agingOrderDetails as $row) {
            $bucketKey = (string) ($row['bucket_key'] ?? '');

            if (! array_key_exists($bucketKey, $bucketStats)) {
                continue;
            }

            $bucketStats[$bucketKey]['orders_count']++;
            $bucketStats[$bucketKey]['due_amount'] += (int) ($row['due_amount'] ?? 0);
        }

        return collect($bucketStats)
            ->map(function (array $bucket) use ($totalDueAmount): array {
                $bucket['due_percent'] = $totalDueAmount > 0
                    ? (int) round(($bucket['due_amount'] / $totalDueAmount) * 100)
                    : 0;

                return $bucket;
            })
            ->values();
    }

    private function agingBucketKey(int $ageDays): string
    {
        if ($ageDays <= 7) {
            return 'd0_7';
        }

        if ($ageDays <= 14) {
            return 'd8_14';
        }

        if ($ageDays <= 30) {
            return 'd15_30';
        }

        return 'd31_plus';
    }

    private function agingBucketLabel(?string $bucketKey): string
    {
        return match ($bucketKey) {
            'd0_7' => '0-7 hari',
            'd8_14' => '8-14 hari',
            'd15_30' => '15-30 hari',
            'd31_plus' => '>30 hari',
            default => 'Semua Bucket',
        };
    }
}
