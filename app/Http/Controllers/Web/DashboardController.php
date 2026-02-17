<?php

namespace App\Http\Controllers\Web;

use App\Domain\Billing\PlanFeatureGateService;
use App\Domain\Billing\QuotaService;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Order;
use App\Models\Outlet;
use App\Models\Payment;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WaMessage;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\View\View;

class DashboardController extends Controller
{
    use EnsuresWebPanelAccess;

    public function __construct(
        private readonly QuotaService $quotaService,
        private readonly PlanFeatureGateService $planFeatureGate,
    ) {
    }

    public function index(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $ordersQuery = Order::query()->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $ordersQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        $monthStart = now()->startOfMonth();
        $monthEnd = now()->endOfMonth();

        $ordersToday = (clone $ordersQuery)
            ->whereDate('created_at', now()->toDateString())
            ->count();

        $ordersThisMonth = (clone $ordersQuery)
            ->whereBetween('created_at', [$monthStart, $monthEnd])
            ->count();

        $previousMonthStart = (clone $monthStart)->subMonth()->startOfMonth();
        $previousMonthEnd = (clone $monthStart)->subMonth()->endOfMonth();

        $ordersLastMonth = (clone $ordersQuery)
            ->whereBetween('created_at', [$previousMonthStart, $previousMonthEnd])
            ->count();

        $revenueQuery = Payment::query()->whereHas('order', function ($q) use ($tenant, $ownerMode, $allowedOutletIds): void {
            $q->where('tenant_id', $tenant->id);

            if (! $ownerMode) {
                $q->whereIn('outlet_id', $allowedOutletIds);
            }
        });

        $revenueThisMonth = (clone $revenueQuery)
            ->whereBetween('paid_at', [$monthStart, $monthEnd])
            ->sum('amount');

        $revenueLastMonth = (clone $revenueQuery)
            ->whereBetween('paid_at', [$previousMonthStart, $previousMonthEnd])
            ->sum('amount');

        $recentOrders = (clone $ordersQuery)
            ->with(['customer:id,name,phone_normalized', 'outlet:id,name', 'courier:id,name'])
            ->latest('created_at')
            ->limit(10)
            ->get();

        $waMessageQuery = WaMessage::query()->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $waMessageQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        $waSummary = [
            'queued' => (clone $waMessageQuery)->where('status', 'queued')->count(),
            'sent' => (clone $waMessageQuery)->where('status', 'sent')->count(),
            'failed' => (clone $waMessageQuery)->where('status', 'failed')->count(),
        ];

        $outletCount = $ownerMode
            ? Outlet::query()->where('tenant_id', $tenant->id)->count()
            : count($allowedOutletIds);

        $userCount = User::query()->where('tenant_id', $tenant->id)->count();

        $quota = $this->quotaService->snapshot($tenant->id);
        $waEnabled = $this->planFeatureGate->isWaEnabledForTenant($tenant->loadMissing('currentPlan:id,key,orders_limit'));

        $dailyRows = (clone $ordersQuery)
            ->whereBetween('created_at', [now()->subDays(6)->startOfDay(), now()->endOfDay()])
            ->selectRaw('DATE(created_at) as day, COUNT(*) as order_count, COALESCE(SUM(total_amount), 0) as revenue_amount')
            ->groupByRaw('DATE(created_at)')
            ->orderByRaw('DATE(created_at)')
            ->get()
            ->keyBy('day');

        $dailyTrend = collect(range(0, 6))
            ->map(function (int $offset) use ($dailyRows): array {
                $day = now()->subDays(6 - $offset)->toDateString();
                $row = $dailyRows->get($day);

                return [
                    'label' => Carbon::parse($day)->format('D'),
                    'orders' => (int) ($row->order_count ?? 0),
                    'revenue' => (int) ($row->revenue_amount ?? 0),
                ];
            });

        $statusSummaryRows = (clone $ordersQuery)
            ->whereBetween('created_at', [$monthStart, $monthEnd])
            ->selectRaw('laundry_status, COUNT(*) as total')
            ->groupBy('laundry_status')
            ->get()
            ->keyBy('laundry_status');

        $statusSummary = collect(['received', 'washing', 'drying', 'ironing', 'ready', 'completed'])
            ->map(function (string $status) use ($statusSummaryRows, $ordersThisMonth): array {
                $total = (int) ($statusSummaryRows->get($status)?->total ?? 0);
                $percent = $ordersThisMonth > 0
                    ? (int) round(($total / $ordersThisMonth) * 100)
                    : 0;

                return [
                    'key' => $status,
                    'label' => str_replace('_', ' ', ucfirst($status)),
                    'total' => $total,
                    'percent' => max(0, min(100, $percent)),
                ];
            })
            ->filter(fn (array $row): bool => $row['total'] > 0)
            ->values();

        $topOutletRows = (clone $ordersQuery)
            ->whereBetween('created_at', [$monthStart, $monthEnd])
            ->selectRaw('outlet_id, COUNT(*) as order_count, COALESCE(SUM(total_amount), 0) as revenue_amount')
            ->groupBy('outlet_id')
            ->orderByDesc('revenue_amount')
            ->limit(5)
            ->get();

        $outletNameMap = Outlet::query()
            ->whereIn('id', $topOutletRows->pluck('outlet_id')->filter()->all())
            ->pluck('name', 'id');

        $topOutlets = $topOutletRows
            ->map(fn ($row): array => [
                'name' => (string) ($outletNameMap[$row->outlet_id] ?? 'Outlet'),
                'orders' => (int) $row->order_count,
                'revenue' => (int) $row->revenue_amount,
            ])
            ->values();

        return view('web.dashboard', [
            'tenant' => $tenant,
            'user' => $user,
            'ownerMode' => $ownerMode,
            'outletCount' => $outletCount,
            'userCount' => $userCount,
            'ordersToday' => $ordersToday,
            'ordersThisMonth' => $ordersThisMonth,
            'ordersLastMonth' => $ordersLastMonth,
            'revenueThisMonth' => (int) $revenueThisMonth,
            'revenueLastMonth' => (int) $revenueLastMonth,
            'quota' => $quota,
            'waSummary' => $waSummary,
            'waEnabled' => $waEnabled,
            'recentOrders' => $recentOrders,
            'dailyTrend' => $dailyTrend,
            'statusSummary' => $statusSummary,
            'topOutlets' => $topOutlets,
        ]);
    }
}
