@extends('web.layouts.app', ['title' => 'Dasbor'])

@php
    $statusClass = function (?string $status): string {
        if (! $status) {
            return 'status-neutral';
        }

        return match ($status) {
            'completed', 'ready', 'delivered' => 'status-success',
            'received', 'pickup_pending', 'delivery_pending' => 'status-warning',
            default => 'status-info',
        };
    };

    $statusLabel = function (?string $status): string {
        if (! $status) {
            return '-';
        }

        return match ($status) {
            'received' => 'diterima',
            'washing' => 'dicuci',
            'drying' => 'dikeringkan',
            'ironing' => 'disetrika',
            'ready' => 'siap',
            'completed' => 'selesai',
            'pickup_pending' => 'jemput tertunda',
            'pickup_on_the_way' => 'kurir menuju jemput',
            'at_outlet' => 'di outlet',
            'delivery_pending' => 'antar tertunda',
            'delivery_on_the_way' => 'kurir menuju antar',
            'delivered' => 'terkirim',
            default => str_replace('_', ' ', (string) $status),
        };
    };
@endphp

@section('content')
@php
    $ordersGrowth = $ordersLastMonth > 0
        ? round((($ordersThisMonth - $ordersLastMonth) / $ordersLastMonth) * 100, 1)
        : null;
    $revenueGrowth = $revenueLastMonth > 0
        ? round((($revenueThisMonth - $revenueLastMonth) / $revenueLastMonth) * 100, 1)
        : null;

    $dailyOrderSeries = $dailyTrend->pluck('orders')->values();
    $dailyRevenueSeries = $dailyTrend->pluck('revenue')->values();
    $dailyLabels = $dailyTrend->pluck('label')->values();
    $maxOutletRevenue = max(1, (int) $topOutlets->max('revenue'));
@endphp

<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Ringkasan Operasional</p>
        <h3>Dasbor Kinerja Tenant</h3>
        <p>Pantau pesanan, pendapatan, status proses laundry, dan performa pengiriman WhatsApp dalam satu tampilan harian untuk pengambilan keputusan cepat.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pesanan Hari Ini</p>
            <p class="hero-kpi-value">{{ number_format($ordersToday) }}</p>
            <p class="hero-kpi-note">Real-time lintas outlet</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pendapatan Bulan Ini</p>
            <p class="hero-kpi-value">Rp{{ number_format($revenueThisMonth) }}</p>
            <p class="hero-kpi-note">Dari order bulan berjalan</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Sisa Kuota</p>
            <p class="hero-kpi-value">{{ is_null($quota['orders_remaining']) ? 'Tak terbatas' : number_format($quota['orders_remaining']) }}</p>
            <p class="hero-kpi-note">Periode {{ $quota['period'] ?? '-' }}</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Pesanan Hari Ini</p>
        <h3 class="metric-value">{{ number_format($ordersToday) }}</h3>
        <p class="muted-line">Ringkasan operasional real-time</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Pesanan Bulan Ini</p>
        <h3 class="metric-value">{{ number_format($ordersThisMonth) }}</h3>
        @if(! is_null($ordersGrowth))
            <p class="metric-trend {{ $ordersGrowth >= 0 ? 'is-up' : 'is-down' }}">{{ $ordersGrowth >= 0 ? '+' : '' }}{{ $ordersGrowth }}% vs bulan lalu</p>
        @else
            <p class="metric-trend">Belum ada baseline bulan lalu</p>
        @endif
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Pendapatan Bulan Ini</p>
        <h3 class="metric-value">Rp{{ number_format($revenueThisMonth) }}</h3>
        @if(! is_null($revenueGrowth))
            <p class="metric-trend {{ $revenueGrowth >= 0 ? 'is-up' : 'is-down' }}">{{ $revenueGrowth >= 0 ? '+' : '' }}{{ $revenueGrowth }}% vs bulan lalu</p>
        @else
            <p class="metric-trend">Belum ada baseline bulan lalu</p>
        @endif
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Sisa Kuota Pesanan</p>
        <h3 class="metric-value">{{ is_null($quota['orders_remaining']) ? 'Tak terbatas' : number_format($quota['orders_remaining']) }}</h3>
        <p class="muted-line">Periode {{ $quota['period'] ?? '-' }}</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Outlet</p>
        <h3 class="metric-value">{{ number_format($outletCount) }}</h3>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Pengguna</p>
        <h3 class="metric-value">{{ number_format($userCount) }}</h3>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">WA Terkirim</p>
        <h3 class="metric-value">{{ number_format($waSummary['sent']) }}</h3>
        <p class="muted-line">{{ $waEnabled ? 'WA premium aktif' : 'Fitur dikunci paket' }}</p>
    </article>
    <article class="metric-card {{ $waSummary['failed'] > 0 ? 'is-danger' : 'is-success' }}">
        <p class="metric-label">WA Gagal</p>
        <h3 class="metric-value">{{ number_format($waSummary['failed']) }}</h3>
        <p class="muted-line">Antrean: {{ number_format($waSummary['queued']) }}</p>
    </article>
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <h3>Tren Pesanan Mingguan</h3>
            <span class="status-badge status-info">7 Hari</span>
        </div>
        <div class="trend-chart"
            data-values='@json($dailyOrderSeries)'
            data-color="#465fff"
            data-fill="1"></div>
        <div class="trend-labels">
            @foreach($dailyLabels as $label)
                <span>{{ $label }}</span>
            @endforeach
        </div>
        <p class="muted-line">Tren pesanan harian 7 hari terakhir.</p>
    </article>

    <article class="panel-section">
        <div class="section-head">
            <h3>Tren Pendapatan Mingguan</h3>
            <span class="status-badge status-success">Bruto</span>
        </div>
        <div class="trend-chart"
            data-values='@json($dailyRevenueSeries)'
            data-color="#12b76a"
            data-fill="1"></div>
        <div class="trend-labels">
            @foreach($dailyLabels as $label)
                <span>{{ $label }}</span>
            @endforeach
        </div>
        <p class="muted-line">Nilai revenue berdasarkan total order per hari.</p>
    </article>
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <h3>Distribusi Proses Laundry</h3>
            <span class="status-badge status-neutral">Bulan Ini</span>
        </div>

        @forelse($statusSummary as $row)
            <div class="status-progress">
                <div class="status-progress-head">
                    <p class="row-title">{{ $row['label'] }}</p>
                    <p class="row-subtitle">{{ number_format($row['total']) }} order</p>
                </div>
                <div class="progress-track">
                    <div class="progress-fill status-{{ $row['key'] }}" style="width: {{ $row['percent'] }}%"></div>
                </div>
            </div>
        @empty
            <p class="muted-line">Belum ada data status pada bulan ini.</p>
        @endforelse
    </article>

    <article class="panel-section">
        <div class="section-head">
            <h3>Pendapatan Outlet Teratas</h3>
            <span class="status-badge status-info">5 Teratas</span>
        </div>

        @forelse($topOutlets as $outlet)
            @php
                $barWidth = max(6, (int) round(($outlet['revenue'] / $maxOutletRevenue) * 100));
            @endphp
            <div class="status-progress">
                <div class="status-progress-head">
                    <p class="row-title">{{ $outlet['name'] }}</p>
                    <p class="row-subtitle">{{ number_format($outlet['orders']) }} pesanan</p>
                </div>
                <div class="progress-track">
                    <div class="progress-fill status-info" style="width: {{ $barWidth }}%"></div>
                </div>
                <p class="muted-line">Rp{{ number_format($outlet['revenue']) }}</p>
            </div>
        @empty
            <p class="muted-line">Belum ada data outlet bulan ini.</p>
        @endforelse
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Pesanan Terbaru</h3>
        <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}" class="btn btn-ghost">Lihat Semua</a>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Pesanan</th>
                <th>Outlet</th>
                <th>Pelanggan</th>
                <th>Laundry</th>
                <th>Kurir</th>
                <th>Total</th>
                <th>Dibuat</th>
            </tr>
            </thead>
            <tbody>
            @forelse($recentOrders as $order)
                <tr>
                    <td>
                        <p class="row-title">{{ $order->invoice_no ?: $order->order_code }}</p>
                        <p class="row-subtitle">{{ $order->order_code }}</p>
                    </td>
                    <td>{{ $order->outlet?->name }}</td>
                    <td>{{ $order->customer?->name }}</td>
                    <td>
                            <span class="status-badge {{ $statusClass($order->laundry_status) }}">{{ $statusLabel($order->laundry_status) }}</span>
                        </td>
                        <td>
                            @if($order->courier_status)
                                <span class="status-badge {{ $statusClass($order->courier_status) }}">{{ $statusLabel($order->courier_status) }}</span>
                            @else
                                <span class="status-badge status-neutral">-</span>
                            @endif
                        </td>
                    <td>
                        <p class="row-title">Rp{{ number_format($order->total_amount) }}</p>
                        @if($order->due_amount > 0)
                            <p class="row-subtitle">Sisa Rp{{ number_format($order->due_amount) }}</p>
                        @endif
                    </td>
                    <td>{{ $order->created_at?->format('d M Y H:i') }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="7">Belum ada order.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
