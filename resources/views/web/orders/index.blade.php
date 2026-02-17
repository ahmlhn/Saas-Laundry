@extends('web.layouts.app', ['title' => 'Papan Pesanan'])

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
    $quickLaundryStatuses = ['received', 'washing', 'drying', 'ironing', 'ready', 'completed'];
    $bulkReport = session('bulk_report');
    $exportParams = array_filter([
        'outlet_id' => $filters['outlet_id'] ?? null,
        'laundry_status' => $filters['laundry_status'] ?? null,
        'courier_status' => $filters['courier_status'] ?? null,
        'search' => $filters['search'] ?? null,
    ], fn ($value) => filled($value));
@endphp

<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Operasional Harian</p>
        <h3>Papan Pesanan Terpadu</h3>
        <p>Kelola pesanan per outlet, jalankan aksi massal, pantau status laundry-kurir, dan prioritaskan penyelesaian tagihan dari satu alur kerja.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Total Terfilter</p>
            <p class="hero-kpi-value">{{ number_format($summary['total']) }}</p>
            <p class="hero-kpi-note">Baris sesuai filter aktif</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Belum Lunas</p>
            <p class="hero-kpi-value">{{ number_format($summary['outstanding_count']) }}</p>
            <p class="hero-kpi-note">Sisa Rp{{ number_format($summary['due_amount']) }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Jemput & Antar</p>
            <p class="hero-kpi-value">{{ number_format($summary['pickup_delivery_count']) }}</p>
            <p class="hero-kpi-note">Pesanan pickup-delivery aktif</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Pesanan Terfilter</p>
        <h3 class="metric-value">{{ number_format($summary['total']) }}</h3>
        <p class="muted-line">Baris sesuai filter saat ini</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Belum Lunas</p>
        <h3 class="metric-value">{{ number_format($summary['outstanding_count']) }}</h3>
        <p class="muted-line">Sisa Rp{{ number_format($summary['due_amount']) }}</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Siap / Selesai</p>
        <h3 class="metric-value">{{ number_format($summary['ready_count']) }} / {{ number_format($summary['completed_count']) }}</h3>
        <p class="muted-line">Ringkasan pipeline laundry</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Jemput & Antar</p>
        <h3 class="metric-value">{{ number_format($summary['pickup_delivery_count']) }}</h3>
        <p class="muted-line">Pesanan antar-jemput aktif</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Filter Pesanan</h3>
            <p class="muted-line">Saring data operasional per outlet dan status.</p>
        </div>
        <div class="filter-actions">
            <a href="{{ route('tenant.orders.export', ['tenant' => $tenant->id] + $exportParams) }}" class="btn btn-muted">Export CSV</a>
            <a href="{{ route('tenant.orders.create', ['tenant' => $tenant->id]) }}" class="btn btn-primary">Buat Transaksi</a>
        </div>
    </div>

    <form method="GET" class="filters-grid">
        <div>
            <label for="outlet_id">Outlet</label>
            <select id="outlet_id" name="outlet_id">
                <option value="">Semua Outlet</option>
                @foreach($outlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(($filters['outlet_id'] ?? '') === $outlet->id)>
                        {{ $outlet->name }} ({{ $outlet->code }})
                    </option>
                @endforeach
            </select>
        </div>

        <div>
            <label for="laundry_status">Status Laundry</label>
            <input id="laundry_status" type="text" name="laundry_status" value="{{ $filters['laundry_status'] ?? '' }}" placeholder="contoh: ready">
        </div>

        <div>
            <label for="courier_status">Status Kurir</label>
            <input id="courier_status" type="text" name="courier_status" value="{{ $filters['courier_status'] ?? '' }}" placeholder="contoh: pickup_on_the_way">
        </div>

        <div>
            <label for="search">Pencarian</label>
            <input id="search" type="text" name="search" value="{{ $filters['search'] ?? '' }}" placeholder="invoice / kode / pelanggan">
        </div>

        <div>
            <label for="limit">Baris</label>
            <select id="limit" name="limit">
                @foreach([20, 30, 50, 100] as $rowLimit)
                    <option value="{{ $rowLimit }}" @selected((int)($filters['limit'] ?? 20) === $rowLimit)>{{ $rowLimit }}</option>
                @endforeach
            </select>
        </div>

        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Filter</button>
            <a class="btn btn-ghost" href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}">Atur Ulang</a>
        </div>
    </form>

    <div class="chip-filter-row">
        <a class="chip-filter-link {{ empty($filters['laundry_status']) ? 'is-active' : '' }}"
           href="{{ route('tenant.orders.index', ['tenant' => $tenant->id, 'outlet_id' => $filters['outlet_id'] ?? null, 'courier_status' => $filters['courier_status'] ?? null, 'search' => $filters['search'] ?? null, 'limit' => $filters['limit'] ?? null]) }}">
            semua status
        </a>
        @foreach($quickLaundryStatuses as $quickStatus)
            <a class="chip-filter-link {{ ($filters['laundry_status'] ?? '') === $quickStatus ? 'is-active' : '' }}"
               href="{{ route('tenant.orders.index', ['tenant' => $tenant->id, 'outlet_id' => $filters['outlet_id'] ?? null, 'laundry_status' => $quickStatus, 'courier_status' => $filters['courier_status'] ?? null, 'search' => $filters['search'] ?? null, 'limit' => $filters['limit'] ?? null]) }}">
                {{ $statusLabel($quickStatus) }}
            </a>
        @endforeach
    </div>
</section>

<section class="panel-section" x-data="orderBulkTable(@js($orders->pluck('id')->values()->all()))">
    <div class="section-head">
        <h3>Hasil Pesanan</h3>
        <p class="muted-line">{{ number_format($orders->total()) }} baris</p>
    </div>

    <form method="POST"
          action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}"
          class="bulk-shell"
          @submit.prevent="submitBulk($event)">
        @csrf
        <input type="hidden" name="selected_ids" :value="selected.join(',')">
        <input type="hidden" name="action" :value="bulkAction">
        <div class="bulk-shell-left">
            <span class="status-badge status-info" x-text="selectedCount + ' dipilih'"></span>
            <p class="muted-line">Pembaruan massal status laundry/kurir untuk pesanan terpilih.</p>
        </div>
        <div class="bulk-shell-right">
            <select x-model="bulkAction">
                <option value="">Pilih aksi massal</option>
                <option value="mark-ready">Tandai siap</option>
                <option value="mark-completed">Tandai selesai</option>
                <option value="courier-delivery-pending">Kurir: menunggu antar</option>
                <option value="courier-delivery-otw">Kurir: menuju antar</option>
                <option value="courier-delivered">Kurir: terkirim</option>
                <option value="assign-courier">Tugaskan kurir</option>
            </select>
            <select
                name="courier_user_id"
                x-model="courierUserId"
                x-show="bulkAction === 'assign-courier'"
                :disabled="bulkAction !== 'assign-courier'"
            >
                <option value="">Pilih kurir</option>
                @foreach($couriers as $courierOption)
                    <option value="{{ $courierOption->id }}">{{ $courierOption->name }}</option>
                @endforeach
            </select>
            <button type="submit" class="btn btn-muted">Terapkan</button>
        </div>
    </form>
    <p class="muted-line" x-show="bulkNotice" x-text="bulkNotice"></p>

    @if(is_array($bulkReport) && ! empty($bulkReport['rows']) && is_array($bulkReport['rows']))
        <div x-data="bulkReportTable(@js($bulkReport['rows']))">
            <div class="section-head">
                <h3>Laporan Aksi Massal</h3>
                <p class="muted-line">
                    Aksi {{ $bulkReport['action'] ?? '-' }}:
                    {{ (int) ($bulkReport['updated'] ?? 0) }} berhasil /
                    {{ (int) ($bulkReport['skipped'] ?? 0) }} dilewati
                </p>
            </div>
            <div class="filters-grid">
                <div>
                    <label for="bulk_report_search">Cari laporan</label>
                    <input id="bulk_report_search" type="text" x-model="search" placeholder="referensi / alasan">
                </div>
                <div>
                    <label for="bulk_report_reason">Filter alasan</label>
                    <select id="bulk_report_reason" x-model="reasonCode">
                        <option value="">Semua alasan</option>
                        <template x-for="reason in reasonOptions" :key="reason.code">
                            <option :value="reason.code" x-text="reason.label"></option>
                        </template>
                    </select>
                </div>
            </div>
            <p class="muted-line" x-text="filteredRows.length + ' baris ditampilkan'"></p>
            <div class="table-wrap">
                <table>
                    <thead>
                    <tr>
                        <th>Referensi</th>
                        <th>Hasil</th>
                        <th>Dari</th>
                        <th>Ke</th>
                        <th>Alasan</th>
                    </tr>
                    </thead>
                    <tbody>
                    <template x-for="row in filteredRows" :key="(row.order_id ?? 'row') + '-' + (row.reason_code ?? 'reason') + '-' + (row.to_status ?? 'to')">
                        <tr>
                            <td x-text="row.order_ref ?? row.order_id ?? '-'"></td>
                            <td>
                                <span class="status-badge" :class="(row.result ?? 'skipped') === 'updated' ? 'status-success' : 'status-warning'" x-text="(row.result ?? 'skipped') === 'updated' ? 'berhasil' : 'dilewati'"></span>
                            </td>
                            <td x-text="token(row.from_status)"></td>
                            <td x-text="token(row.to_status)"></td>
                            <td x-text="row.reason ?? '-'"></td>
                        </tr>
                    </template>
                    <tr x-show="filteredRows.length === 0">
                        <td colspan="5">Tidak ada baris laporan yang cocok dengan filter.</td>
                    </tr>
                    </tbody>
                </table>
            </div>
        </div>
    @endif

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>
                    <input
                        type="checkbox"
                        class="table-check"
                        :checked="allSelected"
                        @change="toggleAll($event.target.checked)"
                    >
                </th>
                <th>Pesanan</th>
                <th>Outlet</th>
                <th>Pelanggan</th>
                <th>Laundry</th>
                <th>Kurir</th>
                <th>Sisa</th>
                <th>Dibuat</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($orders as $order)
                <tr>
                    <td>
                        <input
                            type="checkbox"
                            class="table-check"
                            :checked="isSelected('{{ $order->id }}')"
                            @change="toggle('{{ $order->id }}', $event.target.checked)"
                        >
                    </td>
                    <td>
                        <p class="row-title">
                            <a class="table-link" href="{{ route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $order->id]) }}">
                                {{ $order->invoice_no ?: $order->order_code }}
                            </a>
                        </p>
                        <p class="row-subtitle">{{ $order->order_code }}</p>
                    </td>
                    <td>{{ $order->outlet?->name }}</td>
                    <td>
                        <p class="row-title">{{ $order->customer?->name }}</p>
                        <p class="row-subtitle">{{ $order->customer?->phone_normalized }}</p>
                    </td>
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
                        <p class="row-title">Rp{{ number_format($order->due_amount) }}</p>
                        @if($order->due_amount > 0)
                            <span class="status-badge status-warning">belum lunas</span>
                        @else
                            <span class="status-badge status-success">lunas</span>
                        @endif
                    </td>
                    <td>{{ $order->created_at?->format('d M Y H:i') }}</td>
                    <td>
                        <div class="table-actions" x-data="{ open: false }">
                            <button type="button" class="btn btn-ghost btn-sm" @click="open = !open">Aksi</button>
                            <div class="table-actions-menu" x-cloak x-show="open" @click.outside="open = false">
                                <a href="{{ route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $order->id]) }}">Lihat detail</a>
                                <button type="button" @click="copyRef(@js($order->invoice_no ?: $order->order_code)); open = false">Salin referensi</button>
                                @if($order->customer?->phone_normalized)
                                    <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id, 'search' => $order->customer->phone_normalized]) }}">Cari pelanggan</a>
                                @endif
                                <form method="POST" action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}">
                                    @csrf
                                    <input type="hidden" name="selected_ids" value="{{ $order->id }}">
                                    <input type="hidden" name="action" value="mark-ready">
                                    <button type="submit">Tandai siap</button>
                                </form>
                                <form method="POST" action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}">
                                    @csrf
                                    <input type="hidden" name="selected_ids" value="{{ $order->id }}">
                                    <input type="hidden" name="action" value="mark-completed">
                                    <button type="submit">Tandai selesai</button>
                                </form>
                                @if($order->is_pickup_delivery)
                                    <form method="POST" action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}">
                                        @csrf
                                        <input type="hidden" name="selected_ids" value="{{ $order->id }}">
                                        <input type="hidden" name="action" value="courier-delivery-pending">
                                        <button type="submit">Kurir: menunggu antar</button>
                                    </form>
                                    <form method="POST" action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}">
                                        @csrf
                                        <input type="hidden" name="selected_ids" value="{{ $order->id }}">
                                        <input type="hidden" name="action" value="courier-delivery-otw">
                                        <button type="submit">Kurir: menuju antar</button>
                                    </form>
                                    <form method="POST" action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}">
                                        @csrf
                                        <input type="hidden" name="selected_ids" value="{{ $order->id }}">
                                        <input type="hidden" name="action" value="courier-delivered">
                                        <button type="submit">Kurir: terkirim</button>
                                    </form>
                                    @foreach($couriers as $courierOption)
                                        <form method="POST" action="{{ route('tenant.orders.bulk-update', ['tenant' => $tenant->id]) }}">
                                            @csrf
                                            <input type="hidden" name="selected_ids" value="{{ $order->id }}">
                                            <input type="hidden" name="action" value="assign-courier">
                                            <input type="hidden" name="courier_user_id" value="{{ $courierOption->id }}">
                                            <button type="submit">Tugaskan kurir: {{ $courierOption->name }}</button>
                                        </form>
                                    @endforeach
                                @endif
                            </div>
                        </div>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="9">Belum ada pesanan pada filter ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>

    <div class="pagination-wrap">
        {{ $orders->links() }}
    </div>
</section>
</div>
@endsection
