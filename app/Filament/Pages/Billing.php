<?php

namespace App\Filament\Pages;

use App\Domain\Billing\QuotaService;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Order;
use App\Models\Outlet;
use App\Models\Payment;
use App\Models\QuotaUsage;
use App\Models\TenantSubscription;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use UnitEnum;

class Billing extends Page
{
    protected static ?string $slug = 'billing';

    protected static ?string $navigationLabel = 'Billing';

    protected static string|UnitEnum|null $navigationGroup = 'Keuangan';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBanknotes;

    protected static ?int $navigationSort = 10;

    protected string $view = 'filament.pages.billing';

    public string $period = '';

    public ?string $selectedOutletId = null;

    public ?string $selectedPaymentStatus = null;

    public ?string $selectedAgingBucket = null;

    public ?string $selectedCollectionStatus = null;

    public string $cashDate = '';

    public bool $ownerMode = false;

    public array $quota = [];

    public array $availableOutlets = [];

    public string $selectedOutletLabel = 'Semua Outlet Scope';

    public string $selectedPaymentStatusLabel = 'Semua Status Pembayaran';

    public string $selectedAgingBucketLabel = 'Semua Bucket';

    public string $selectedCollectionStatusLabel = 'Semua Status Penagihan';

    public ?array $subscription = null;

    public int $ordersCount = 0;

    public int $grossAmount = 0;

    public int $paidAmount = 0;

    public int $outstandingAmount = 0;

    public ?int $usagePercent = null;

    public array $usageHistory = [];

    public array $outletSummary = [];

    public int $agingOutstandingOrders = 0;

    public int $agingOutstandingAmount = 0;

    public array $agingSummary = [];

    public array $agingOrderDetails = [];

    public int $collectionFollowUpDueCount = 0;

    public int $collectionFollowUpDueAmount = 0;

    public array $cashReconciliation = [];

    public array $cashMethodSummary = [];

    public array $cashDailyDetails = [];

    public static function canAccess(): bool
    {
        return filled(TenantPanelAccess::tenantId())
            && (TenantPanelAccess::user()?->hasAnyRole(['owner', 'admin']) ?? false);
    }

    public function mount(): void
    {
        $this->period = $this->sanitizePeriod((string) request()->query('period', now()->format('Y-m')));
        $this->selectedOutletId = $this->sanitizeNullableString(request()->query('outlet_id'));
        $this->selectedPaymentStatus = $this->sanitizeEnum(
            request()->query('payment_status'),
            ['paid', 'partial', 'unpaid'],
        );
        $this->selectedAgingBucket = $this->sanitizeEnum(
            request()->query('aging_bucket'),
            ['d0_7', 'd8_14', 'd15_30', 'd31_plus'],
        );
        $this->selectedCollectionStatus = $this->sanitizeEnum(
            request()->query('collection_status'),
            ['pending', 'contacted', 'promise_to_pay', 'escalated', 'resolved'],
        );
        $this->cashDate = $this->sanitizeDate((string) request()->query('cash_date', now()->format('Y-m-d')));

        $this->hydratePageData();
    }

    private function hydratePageData(): void
    {
        $tenant = TenantPanelAccess::tenant();
        $user = TenantPanelAccess::user();

        abort_unless($tenant && $user, 403);
        $tenant->loadMissing('currentPlan:id,key,name,orders_limit');

        $this->ownerMode = TenantPanelAccess::isOwner($user);
        $allowedOutletIds = TenantPanelAccess::allowedOutletIds($user);

        $periodStart = Carbon::createFromFormat('Y-m', $this->period)->startOfMonth();
        $periodEnd = $periodStart->copy()->endOfMonth();
        $cashDateStart = Carbon::createFromFormat('Y-m-d', $this->cashDate)->startOfDay();
        $cashDateEnd = $cashDateStart->copy()->endOfDay();

        $availableOutlets = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->when(! $this->ownerMode, fn (Builder $query) => $query->whereIn('id', $allowedOutletIds))
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        if ($this->selectedOutletId && ! $availableOutlets->pluck('id')->contains($this->selectedOutletId)) {
            $this->selectedOutletId = null;
        }

        $selectedOutlet = $availableOutlets->firstWhere('id', $this->selectedOutletId);
        $this->availableOutlets = $availableOutlets
            ->map(fn (Outlet $outlet): array => [
                'id' => (string) $outlet->id,
                'name' => $outlet->name,
                'code' => $outlet->code,
            ])
            ->all();
        $this->selectedOutletLabel = $selectedOutlet?->name ?: 'Semua Outlet Scope';
        $this->selectedPaymentStatusLabel = $this->paymentStatusLabel($this->selectedPaymentStatus);
        $this->selectedAgingBucketLabel = $this->agingBucketLabel($this->selectedAgingBucket);
        $this->selectedCollectionStatusLabel = $this->collectionStatusLabel($this->selectedCollectionStatus);

        $ordersInScope = Order::query()
            ->where('tenant_id', $tenant->id)
            ->when(! $this->ownerMode, fn (Builder $query) => $query->whereIn('outlet_id', $allowedOutletIds))
            ->when($this->selectedOutletId, fn (Builder $query) => $query->where('outlet_id', $this->selectedOutletId));

        $this->applyPaymentStatusOrderFilter($ordersInScope, $this->selectedPaymentStatus);

        $ordersSelectedPeriod = (clone $ordersInScope)
            ->whereBetween('created_at', [$periodStart, $periodEnd]);

        $this->ordersCount = (int) (clone $ordersSelectedPeriod)->count();
        $this->grossAmount = (int) (clone $ordersSelectedPeriod)->sum('total_amount');
        $this->outstandingAmount = (int) (clone $ordersSelectedPeriod)->sum('due_amount');

        $this->paidAmount = (int) Payment::query()
            ->whereBetween('paid_at', [$periodStart, $periodEnd])
            ->whereHas('order', function (Builder $query) use ($tenant, $allowedOutletIds): void {
                $query->where('tenant_id', $tenant->id);

                if (! $this->ownerMode) {
                    $query->whereIn('outlet_id', $allowedOutletIds);
                }

                if ($this->selectedOutletId) {
                    $query->where('outlet_id', $this->selectedOutletId);
                }

                $this->applyPaymentStatusOrderFilter($query, $this->selectedPaymentStatus);
            })
            ->sum('amount');

        $quota = app(QuotaService::class)->snapshot($tenant->id, $this->period);
        $this->quota = $quota;
        $this->usagePercent = is_null($quota['orders_limit'])
            ? null
            : (int) min(100, round(($quota['orders_used'] / max((int) $quota['orders_limit'], 1)) * 100));

        $subscription = TenantSubscription::query()
            ->with('plan:id,key,name,orders_limit')
            ->where('tenant_id', $tenant->id)
            ->where('period', $this->period)
            ->first();
        $this->subscription = $subscription ? [
            'status' => (string) $subscription->status,
            'period' => (string) $subscription->period,
            'starts_at' => $subscription->starts_at?->format('d M Y H:i'),
            'ends_at' => $subscription->ends_at?->format('d M Y H:i'),
            'plan_name' => (string) ($subscription->plan?->name ?? '-'),
            'plan_key' => (string) ($subscription->plan?->key ?? '-'),
        ] : null;

        $historyPeriods = collect(range(5, 0))
            ->map(fn (int $offset): string => $periodStart->copy()->subMonths($offset)->format('Y-m'))
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
            ->whereHas('order', function (Builder $query) use ($tenant, $allowedOutletIds): void {
                $query->where('tenant_id', $tenant->id);

                if (! $this->ownerMode) {
                    $query->whereIn('outlet_id', $allowedOutletIds);
                }

                if ($this->selectedOutletId) {
                    $query->where('outlet_id', $this->selectedOutletId);
                }

                $this->applyPaymentStatusOrderFilter($query, $this->selectedPaymentStatus);
            })
            ->get(['paid_at', 'amount'])
            ->groupBy(fn (Payment $payment): string => (string) $payment->paid_at?->format('Y-m'))
            ->map(fn ($rows): int => (int) $rows->sum('amount'));

        $this->usageHistory = $historyPeriods
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
                $remaining = is_null($ordersLimit) ? null : max((int) $ordersLimit - $ordersUsed, 0);
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
            ->values()
            ->all();

        $outletSummaryRows = (clone $ordersSelectedPeriod)
            ->selectRaw('outlet_id, COUNT(*) as orders_count, COALESCE(SUM(total_amount), 0) as gross_amount, COALESCE(SUM(due_amount), 0) as due_amount')
            ->groupBy('outlet_id')
            ->orderByDesc('gross_amount')
            ->get();

        $outletNameMap = Outlet::query()
            ->whereIn('id', $outletSummaryRows->pluck('outlet_id')->filter()->all())
            ->pluck('name', 'id');

        $outletPaidAmountQuery = Payment::query()
            ->join('orders', 'orders.id', '=', 'payments.order_id')
            ->where('orders.tenant_id', $tenant->id)
            ->whereBetween('payments.paid_at', [$periodStart, $periodEnd]);

        if (! $this->ownerMode) {
            $outletPaidAmountQuery->whereIn('orders.outlet_id', $allowedOutletIds);
        }

        if ($this->selectedOutletId) {
            $outletPaidAmountQuery->where('orders.outlet_id', $this->selectedOutletId);
        }

        $this->applyPaymentStatusOrderFilter($outletPaidAmountQuery, $this->selectedPaymentStatus, 'orders');

        $outletPaidAmountMap = $outletPaidAmountQuery
            ->selectRaw('orders.outlet_id as outlet_id, COALESCE(SUM(payments.amount), 0) as paid_amount')
            ->groupBy('orders.outlet_id')
            ->pluck('paid_amount', 'outlet_id');

        $this->outletSummary = $outletSummaryRows
            ->map(fn ($row): array => [
                'outlet_id' => (string) $row->outlet_id,
                'outlet_name' => (string) ($outletNameMap[$row->outlet_id] ?? 'Outlet'),
                'orders_count' => (int) $row->orders_count,
                'gross_amount' => (int) $row->gross_amount,
                'paid_amount' => (int) ($outletPaidAmountMap[$row->outlet_id] ?? 0),
                'due_amount' => (int) $row->due_amount,
            ])
            ->values()
            ->all();

        $agingRowsQuery = (clone $ordersInScope)->where('due_amount', '>', 0);
        $this->applyCollectionStatusOrderFilter($agingRowsQuery, $this->selectedCollectionStatus);

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
        $agingDetailsAll = $agingRows
            ->map(function (Order $order) use ($currentDay): array {
                $ageDays = Carbon::parse($order->created_at)->startOfDay()->diffInDays($currentDay);
                $bucketKey = $this->agingBucketKey($ageDays);
                $collectionStatus = $this->normalizeCollectionStatus($order);
                $nextFollowUpAt = $order->collection_next_follow_up_at;

                return [
                    'order_id' => (string) $order->id,
                    'invoice_or_order_code' => (string) ($order->invoice_no ?: $order->order_code),
                    'order_code' => (string) $order->order_code,
                    'outlet_name' => (string) ($order->outlet?->name ?? 'Outlet'),
                    'outlet_code' => (string) ($order->outlet?->code ?? '-'),
                    'customer_name' => (string) ($order->customer?->name ?? '-'),
                    'customer_phone' => (string) ($order->customer?->phone_normalized ?? '-'),
                    'age_days' => $ageDays,
                    'bucket_key' => $bucketKey,
                    'bucket_label' => $this->agingBucketLabel($bucketKey),
                    'due_amount' => (int) $order->due_amount,
                    'collection_status' => $collectionStatus,
                    'collection_status_label' => $this->collectionStatusLabel($collectionStatus),
                    'collection_last_contacted_at' => $order->collection_last_contacted_at?->format('d M Y H:i') ?? '-',
                    'collection_next_follow_up_at' => $nextFollowUpAt?->format('d M Y H:i') ?? '-',
                    'collection_next_follow_up_at_input' => $nextFollowUpAt?->format('Y-m-d\TH:i') ?? '',
                    'collection_follow_up_due' => $nextFollowUpAt ? $nextFollowUpAt->lte(now()) : false,
                    'collection_note' => (string) ($order->collection_note ?? ''),
                    'created_at' => $order->created_at?->format('d M Y H:i') ?? '-',
                ];
            })
            ->values();

        $agingDetails = $this->selectedAgingBucket
            ? $agingDetailsAll->where('bucket_key', $this->selectedAgingBucket)->values()
            : $agingDetailsAll;

        $this->agingOutstandingOrders = (int) $agingDetails->count();
        $this->agingOutstandingAmount = (int) $agingDetails->sum('due_amount');
        $this->agingSummary = $this->buildAgingSummary($agingDetails, $this->agingOutstandingAmount, $this->selectedAgingBucket)->all();
        $this->agingOrderDetails = $agingDetails->all();
        $this->collectionFollowUpDueCount = (int) $agingDetails->where('collection_follow_up_due', true)->count();
        $this->collectionFollowUpDueAmount = (int) $agingDetails->where('collection_follow_up_due', true)->sum('due_amount');

        $cashPayments = Payment::query()
            ->whereBetween('paid_at', [$cashDateStart, $cashDateEnd])
            ->whereHas('order', function (Builder $query) use ($tenant, $allowedOutletIds): void {
                $query->where('tenant_id', $tenant->id);

                if (! $this->ownerMode) {
                    $query->whereIn('outlet_id', $allowedOutletIds);
                }

                if ($this->selectedOutletId) {
                    $query->where('outlet_id', $this->selectedOutletId);
                }

                $this->applyPaymentStatusOrderFilter($query, $this->selectedPaymentStatus);
            })
            ->with([
                'order:id,outlet_id,invoice_no,order_code,due_amount',
                'order.outlet:id,name,code',
            ])
            ->orderByDesc('paid_at')
            ->get(['id', 'order_id', 'amount', 'method', 'paid_at', 'notes']);

        $cashDailyDetails = $cashPayments
            ->map(function (Payment $payment): array {
                $method = strtolower(trim((string) $payment->method));

                return [
                    'date' => $this->cashDate,
                    'paid_at' => $payment->paid_at?->format('d M Y H:i') ?? '-',
                    'outlet_name' => (string) ($payment->order?->outlet?->name ?? 'Outlet'),
                    'outlet_code' => (string) ($payment->order?->outlet?->code ?? ''),
                    'invoice_or_order_code' => (string) ($payment->order?->invoice_no ?: $payment->order?->order_code ?: '-'),
                    'order_code' => (string) ($payment->order?->order_code ?? '-'),
                    'payment_method' => $method === '' ? 'other' : $method,
                    'payment_amount' => (int) $payment->amount,
                    'order_due_amount' => (int) ($payment->order?->due_amount ?? 0),
                ];
            })
            ->values();

        $cashCollected = (int) $cashDailyDetails->sum('payment_amount');
        $cashCollectedTunai = (int) $cashDailyDetails
            ->filter(fn (array $row): bool => in_array($row['payment_method'], ['cash', 'tunai'], true))
            ->sum('payment_amount');

        $this->cashMethodSummary = $cashDailyDetails
            ->groupBy('payment_method')
            ->map(fn ($rows, string $method): array => [
                'method' => $method,
                'label' => $this->paymentMethodLabel($method),
                'transactions_count' => $rows->count(),
                'amount' => (int) $rows->sum('payment_amount'),
            ])
            ->sortByDesc('amount')
            ->values()
            ->all();

        $this->cashDailyDetails = $cashDailyDetails->all();
        $this->cashReconciliation = [
            'date' => $this->cashDate,
            'transactions_count' => (int) $cashDailyDetails->count(),
            'outlets_count' => (int) $cashDailyDetails->pluck('outlet_name')->filter()->unique()->count(),
            'total_collected' => $cashCollected,
            'cash_collected' => $cashCollectedTunai,
            'non_cash_collected' => max($cashCollected - $cashCollectedTunai, 0),
            'outstanding_orders' => (int) (clone $ordersInScope)->where('due_amount', '>', 0)->count(),
            'outstanding_amount' => (int) (clone $ordersInScope)->where('due_amount', '>', 0)->sum('due_amount'),
        ];
    }

    private function sanitizePeriod(string $value): string
    {
        return preg_match('/^\d{4}-\d{2}$/', $value) ? $value : now()->format('Y-m');
    }

    private function sanitizeDate(string $value): string
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : now()->format('Y-m-d');
    }

    private function sanitizeNullableString(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function sanitizeEnum(mixed $value, array $allowed): ?string
    {
        return is_string($value) && in_array($value, $allowed, true) ? $value : null;
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

    private function applyCollectionStatusOrderFilter(Builder $query, ?string $collectionStatus): void
    {
        if (! $collectionStatus) {
            return;
        }

        if ($collectionStatus === 'pending') {
            $query->where(function (Builder $builder): void {
                $builder->whereNull('collection_status')
                    ->orWhere('collection_status', 'pending');
            });

            return;
        }

        $query->where('collection_status', '=', $collectionStatus);
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

        return in_array($status, ['pending', 'contacted', 'promise_to_pay', 'escalated', 'resolved'], true)
            ? $status
            : 'pending';
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
