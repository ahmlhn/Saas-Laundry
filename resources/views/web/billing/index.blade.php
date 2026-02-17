@extends('web.layouts.app', ['title' => 'Billing & Kuota'])

@php
    $ordersLimitLabel = is_null($quota['orders_limit'] ?? null)
        ? 'Tak terbatas'
        : number_format((int) $quota['orders_limit']);
    $ordersRemainingLabel = is_null($quota['orders_remaining'] ?? null)
        ? 'Tak terbatas'
        : number_format((int) $quota['orders_remaining']);
    $billingParams = array_filter([
        'period' => $period,
        'outlet_id' => $selectedOutletId ?? null,
        'payment_status' => $selectedPaymentStatus ?? null,
        'aging_bucket' => $selectedAgingBucket ?? null,
        'collection_status' => $selectedCollectionStatus ?? null,
        'cash_date' => $cashDate ?? null,
    ]);
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Kontrol Finansial</p>
        <h3>Billing &amp; Kuota Transaksi</h3>
        <p>Pantau limit order bulanan, pemakaian kuota, dan performa pembayaran tenant dalam satu panel untuk keputusan operasional dan kapasitas layanan.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Periode</p>
            <p class="hero-kpi-value">{{ $period }}</p>
            <p class="hero-kpi-note">Snapshot billing aktif</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Paket</p>
            <p class="hero-kpi-value">{{ strtoupper((string) ($quota['plan'] ?? '-')) }}</p>
            <p class="hero-kpi-note">{{ $ownerMode ? 'Akses owner' : 'Akses admin' }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Kuota Tersisa</p>
            <p class="hero-kpi-value">{{ $ordersRemainingLabel }}</p>
            <p class="hero-kpi-note">{{ $quota['can_create_order'] ? 'Order baru diizinkan' : 'Order baru diblokir' }}</p>
        </article>
    </div>
</section>

@if(session('status'))
<section class="panel-section">
    <p class="status-badge status-success">{{ session('status') }}</p>
</section>
@endif

<section class="panel-section">
    <div class="section-head">
        <h3>Filter Billing</h3>
        <div class="filter-actions">
            <a href="{{ route('tenant.billing.export', ['tenant' => $tenant->id] + $billingParams + ['dataset' => 'outlets']) }}" class="btn btn-muted">Export Outlet CSV</a>
            <a href="{{ route('tenant.billing.export', ['tenant' => $tenant->id] + $billingParams + ['dataset' => 'usage']) }}" class="btn btn-muted">Export Riwayat CSV</a>
            <a href="{{ route('tenant.billing.export', ['tenant' => $tenant->id] + $billingParams + ['dataset' => 'orders']) }}" class="btn btn-muted">Export Detail CSV</a>
            <a href="{{ route('tenant.billing.export', ['tenant' => $tenant->id] + $billingParams + ['dataset' => 'aging']) }}" class="btn btn-muted">Export Aging CSV</a>
            <a href="{{ route('tenant.billing.export', ['tenant' => $tenant->id] + $billingParams + ['dataset' => 'aging_details']) }}" class="btn btn-muted">Export Aging Detail CSV</a>
            <a href="{{ route('tenant.billing.export', ['tenant' => $tenant->id] + $billingParams + ['dataset' => 'cash_daily']) }}" class="btn btn-muted">Export Rekonsiliasi Harian</a>
        </div>
    </div>
    <form method="GET" class="filters-grid">
        <div>
            <label for="period">Periode</label>
            <input id="period" type="month" name="period" value="{{ $period }}">
        </div>
        <div>
            <label for="outlet_id">Outlet</label>
            <select id="outlet_id" name="outlet_id">
                <option value="">Semua Outlet Scope</option>
                @foreach($availableOutlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(($selectedOutletId ?? null) === $outlet->id)>{{ $outlet->name }} ({{ $outlet->code }})</option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="payment_status">Status Pembayaran</label>
            <select id="payment_status" name="payment_status">
                <option value="">Semua Status</option>
                <option value="paid" @selected(($selectedPaymentStatus ?? null) === 'paid')>Lunas</option>
                <option value="partial" @selected(($selectedPaymentStatus ?? null) === 'partial')>Sebagian</option>
                <option value="unpaid" @selected(($selectedPaymentStatus ?? null) === 'unpaid')>Belum Bayar</option>
            </select>
        </div>
        <div>
            <label for="aging_bucket">Bucket Aging</label>
            <select id="aging_bucket" name="aging_bucket">
                <option value="">Semua Bucket</option>
                <option value="d0_7" @selected(($selectedAgingBucket ?? null) === 'd0_7')>0-7 hari</option>
                <option value="d8_14" @selected(($selectedAgingBucket ?? null) === 'd8_14')>8-14 hari</option>
                <option value="d15_30" @selected(($selectedAgingBucket ?? null) === 'd15_30')>15-30 hari</option>
                <option value="d31_plus" @selected(($selectedAgingBucket ?? null) === 'd31_plus')>>30 hari</option>
            </select>
        </div>
        <div>
            <label for="collection_status">Status Penagihan</label>
            <select id="collection_status" name="collection_status">
                <option value="">Semua Status Penagihan</option>
                <option value="pending" @selected(($selectedCollectionStatus ?? null) === 'pending')>Belum Ditindaklanjuti</option>
                <option value="contacted" @selected(($selectedCollectionStatus ?? null) === 'contacted')>Sudah Dihubungi</option>
                <option value="promise_to_pay" @selected(($selectedCollectionStatus ?? null) === 'promise_to_pay')>Janji Bayar</option>
                <option value="escalated" @selected(($selectedCollectionStatus ?? null) === 'escalated')>Eskalasi</option>
                <option value="resolved" @selected(($selectedCollectionStatus ?? null) === 'resolved')>Selesai</option>
            </select>
        </div>
        <div>
            <label for="cash_date">Tanggal Rekonsiliasi Kas</label>
            <input id="cash_date" type="date" name="cash_date" value="{{ $cashDate }}">
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Terapkan</button>
        </div>
    </form>
    <p class="muted-line">Filter aktif: {{ $selectedOutletLabel ?? 'Semua Outlet Scope' }} | {{ $selectedPaymentStatusLabel ?? 'Semua Status Pembayaran' }} | {{ $selectedAgingBucketLabel ?? 'Semua Bucket' }} | {{ $selectedCollectionStatusLabel ?? 'Semua Status Penagihan' }} | Kas {{ $cashDate }}</p>
</section>

<section class="metric-grid">
    <article class="metric-card is-info">
        <p class="metric-label">Limit Kuota</p>
        <h3 class="metric-value">{{ $ordersLimitLabel }}</h3>
        <p class="muted-line">Plan {{ strtoupper((string) ($quota['plan'] ?? '-')) }}</p>
    </article>
    <article class="metric-card is-primary">
        <p class="metric-label">Terpakai</p>
        <h3 class="metric-value">{{ number_format((int) ($quota['orders_used'] ?? 0)) }}</h3>
        <p class="muted-line">Order terhitung periode ini</p>
    </article>
    <article class="metric-card {{ ($quota['can_create_order'] ?? false) ? 'is-success' : 'is-danger' }}">
        <p class="metric-label">Sisa Kuota</p>
        <h3 class="metric-value">{{ $ordersRemainingLabel }}</h3>
        <p class="muted-line">{{ ($quota['can_create_order'] ?? false) ? 'Masih bisa transaksi baru' : 'Batas kuota sudah habis' }}</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Order Periode</p>
        <h3 class="metric-value">{{ number_format($ordersCount) }}</h3>
        <p class="muted-line">Scope outlet sesuai akses akun</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Pembayaran Masuk</p>
        <h3 class="metric-value">Rp{{ number_format($paidAmount) }}</h3>
        <p class="muted-line">Berdasarkan tanggal pembayaran</p>
    </article>
    <article class="metric-card {{ $outstandingAmount > 0 ? 'is-danger' : 'is-success' }}">
        <p class="metric-label">Piutang Berjalan</p>
        <h3 class="metric-value">Rp{{ number_format($outstandingAmount) }}</h3>
        <p class="muted-line">Sisa tagihan order periode ini</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Nilai Bruto Order</p>
        <h3 class="metric-value">Rp{{ number_format($grossAmount) }}</h3>
        <p class="muted-line">Sebelum pelunasan</p>
    </article>
    <article class="metric-card {{ is_null($usagePercent) ? 'is-info' : (($usagePercent >= 85) ? 'is-warning' : 'is-success') }}">
        <p class="metric-label">Utilisasi Kuota</p>
        <h3 class="metric-value">{{ is_null($usagePercent) ? 'Tanpa Batas' : "{$usagePercent}%" }}</h3>
        <p class="muted-line">Monitoring kapasitas transaksi</p>
    </article>
    <article class="metric-card {{ ($collectionFollowUpDueCount ?? 0) > 0 ? 'is-warning' : 'is-success' }}">
        <p class="metric-label">Follow-up Jatuh Tempo</p>
        <h3 class="metric-value">{{ number_format((int) ($collectionFollowUpDueCount ?? 0)) }}</h3>
        <p class="muted-line">Nominal: Rp{{ number_format((int) ($collectionFollowUpDueAmount ?? 0)) }}</p>
    </article>
    <article class="metric-card is-primary">
        <p class="metric-label">Kas Masuk {{ $cashDate }}</p>
        <h3 class="metric-value">Rp{{ number_format((int) ($cashReconciliation['total_collected'] ?? 0)) }}</h3>
        <p class="muted-line">{{ number_format((int) ($cashReconciliation['transactions_count'] ?? 0)) }} transaksi</p>
    </article>
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <h3>Langganan Periode {{ $period }}</h3>
            <span class="status-badge {{ $subscription ? 'status-success' : 'status-neutral' }}">{{ $subscription ? 'Aktif Tercatat' : 'Belum Tercatat' }}</span>
        </div>

        @if($subscription)
            <div class="table-wrap">
                <table>
                    <tbody>
                    <tr>
                        <th>Status</th>
                        <td>{{ strtoupper((string) $subscription->status) }}</td>
                    </tr>
                    <tr>
                        <th>Paket</th>
                        <td>{{ $subscription->plan?->name ?? '-' }} ({{ strtoupper((string) ($subscription->plan?->key ?? '-')) }})</td>
                    </tr>
                    <tr>
                        <th>Periode</th>
                        <td>{{ $subscription->period }}</td>
                    </tr>
                    <tr>
                        <th>Mulai</th>
                        <td>{{ $subscription->starts_at?->format('d M Y H:i') ?? '-' }}</td>
                    </tr>
                    <tr>
                        <th>Berakhir</th>
                        <td>{{ $subscription->ends_at?->format('d M Y H:i') ?? '-' }}</td>
                    </tr>
                    </tbody>
                </table>
            </div>
        @else
            <p class="muted-line">Data langganan periode ini belum tersedia. Gunakan snapshot kuota sebagai baseline operasional.</p>
        @endif
    </article>

    <article class="panel-section">
        <div class="section-head">
            <h3>Progress Pemakaian Kuota</h3>
            <span class="status-badge {{ ($quota['can_create_order'] ?? false) ? 'status-success' : 'status-danger' }}">{{ ($quota['can_create_order'] ?? false) ? 'Aman' : 'Perlu Upgrade/Reset' }}</span>
        </div>

        @if(is_null($usagePercent))
            <p class="muted-line">Paket saat ini tidak memiliki batas kuota order bulanan.</p>
        @else
            <div class="status-progress">
                <div class="status-progress-head">
                    <p class="row-title">Kuota terpakai</p>
                    <p class="row-subtitle">{{ number_format((int) ($quota['orders_used'] ?? 0)) }} / {{ $ordersLimitLabel }}</p>
                </div>
                <div class="progress-track">
                    <div class="progress-fill status-info" style="width: {{ max(3, $usagePercent) }}%"></div>
                </div>
            </div>
            <p class="muted-line">{{ $usagePercent }}% dari kuota periode {{ $period }} sudah digunakan.</p>
        @endif
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Riwayat 6 Bulan</h3>
        <span class="status-badge status-info">Kuota vs Realisasi</span>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Periode</th>
                <th>Kuota</th>
                <th>Terpakai</th>
                <th>Sisa</th>
                <th>Order Aktual</th>
                <th>Pembayaran</th>
            </tr>
            </thead>
            <tbody>
            @foreach($usageHistory as $row)
                <tr>
                    <td><p class="row-title">{{ $row['label'] }}</p><p class="row-subtitle">{{ $row['period'] }}</p></td>
                    <td>{{ is_null($row['orders_limit']) ? 'Tak terbatas' : number_format((int) $row['orders_limit']) }}</td>
                    <td>
                        {{ number_format((int) $row['orders_used']) }}
                        @if(! is_null($row['usage_percent']))
                            <span class="row-subtitle">({{ $row['usage_percent'] }}%)</span>
                        @endif
                    </td>
                    <td>{{ is_null($row['orders_remaining']) ? 'Tak terbatas' : number_format((int) $row['orders_remaining']) }}</td>
                    <td>{{ number_format((int) $row['orders_count']) }}</td>
                    <td>Rp{{ number_format((int) $row['paid_amount']) }}</td>
                </tr>
            @endforeach
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Laporan Invoice Aging</h3>
        <span class="status-badge {{ $agingOutstandingAmount > 0 ? 'status-warning' : 'status-success' }}">{{ number_format($agingOutstandingOrders) }} order outstanding</span>
    </div>
    <p class="muted-line">Total piutang aktif: Rp{{ number_format((int) $agingOutstandingAmount) }} | Scope: {{ $selectedOutletLabel ?? 'Semua Outlet Scope' }} | {{ $selectedPaymentStatusLabel ?? 'Semua Status Pembayaran' }} | Bucket: {{ $selectedAgingBucketLabel ?? 'Semua Bucket' }} | Penagihan: {{ $selectedCollectionStatusLabel ?? 'Semua Status Penagihan' }}</p>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Bucket Umur</th>
                <th>Jumlah Order</th>
                <th>Nominal Piutang</th>
                <th>Kontribusi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($agingSummary as $bucket)
                <tr>
                    <td>{{ $bucket['bucket_label'] }}</td>
                    <td>{{ number_format((int) $bucket['orders_count']) }}</td>
                    <td>Rp{{ number_format((int) $bucket['due_amount']) }}</td>
                    <td>{{ number_format((int) $bucket['due_percent']) }}%</td>
                </tr>
            @empty
                <tr>
                    <td colspan="4">Belum ada data aging.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Detail Invoice Aging</h3>
        <span class="status-badge status-info">{{ number_format($agingOrderDetails->count()) }} baris</span>
    </div>
    <p class="muted-line">Daftar order outstanding untuk bucket aging terpilih beserta status tindak lanjut penagihan.</p>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Order</th>
                <th>Outlet</th>
                <th>Pelanggan</th>
                <th>Umur</th>
                <th>Bucket</th>
                <th>Piutang</th>
                <th>Workflow Penagihan</th>
                <th>Aksi Follow-up</th>
                <th>Dibuat</th>
            </tr>
            </thead>
            <tbody>
            @forelse($agingOrderDetails as $row)
                <tr>
                    <td>
                        <p class="row-title">{{ $row['invoice_or_order_code'] }}</p>
                        <p class="row-subtitle">{{ $row['order_code'] }}</p>
                    </td>
                    <td>
                        <p class="row-title">{{ $row['outlet_name'] }}</p>
                        <p class="row-subtitle">{{ $row['outlet_code'] }}</p>
                    </td>
                    <td>
                        <p class="row-title">{{ $row['customer_name'] }}</p>
                        <p class="row-subtitle">{{ $row['customer_phone'] }}</p>
                    </td>
                    <td>{{ number_format((int) $row['age_days']) }} hari</td>
                    <td>{{ $row['bucket_label'] }}</td>
                    <td>Rp{{ number_format((int) $row['due_amount']) }}</td>
                    <td>
                        <p class="row-title">{{ $row['collection_status_label'] }}</p>
                        <p class="row-subtitle">Last: {{ $row['collection_last_contacted_at'] }}</p>
                        <p class="row-subtitle">Next: {{ $row['collection_next_follow_up_at'] }}</p>
                    </td>
                    <td>
                        <form method="POST" action="{{ route('tenant.billing.collection.update', ['tenant' => $tenant->id, 'order' => $row['order_id']]) }}" class="table-form-stack">
                            @csrf
                            <select name="collection_status">
                                <option value="pending" @selected($row['collection_status'] === 'pending')>Belum Ditindaklanjuti</option>
                                <option value="contacted" @selected($row['collection_status'] === 'contacted')>Sudah Dihubungi</option>
                                <option value="promise_to_pay" @selected($row['collection_status'] === 'promise_to_pay')>Janji Bayar</option>
                                <option value="escalated" @selected($row['collection_status'] === 'escalated')>Eskalasi</option>
                                <option value="resolved" @selected($row['collection_status'] === 'resolved')>Selesai</option>
                            </select>
                            <input type="datetime-local" name="collection_next_follow_up_at" value="{{ $row['collection_next_follow_up_at_input'] }}">
                            <input type="text" name="collection_note" maxlength="500" value="{{ $row['collection_note'] }}" placeholder="Catatan follow-up">
                            <button class="btn btn-muted" type="submit">Simpan</button>
                        </form>
                    </td>
                    <td>{{ $row['created_at'] }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="9">Belum ada detail aging untuk filter saat ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Rekonsiliasi Kas Harian ({{ $cashDate }})</h3>
        <span class="status-badge status-info">{{ number_format((int) ($cashReconciliation['transactions_count'] ?? 0)) }} transaksi</span>
    </div>
    <p class="muted-line">Kas masuk tunai Rp{{ number_format((int) ($cashReconciliation['cash_collected'] ?? 0)) }} | Non-tunai Rp{{ number_format((int) ($cashReconciliation['non_cash_collected'] ?? 0)) }} | Outstanding berjalan Rp{{ number_format((int) ($cashReconciliation['outstanding_amount'] ?? 0)) }}</p>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Metode</th>
                <th>Jumlah Transaksi</th>
                <th>Nominal</th>
            </tr>
            </thead>
            <tbody>
            @forelse($cashMethodSummary as $row)
                <tr>
                    <td>{{ $row['label'] }}</td>
                    <td>{{ number_format((int) $row['transactions_count']) }}</td>
                    <td>Rp{{ number_format((int) $row['amount']) }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="3">Belum ada pembayaran pada tanggal ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Detail Rekonsiliasi Kas Harian</h3>
        <span class="status-badge status-neutral">{{ number_format($cashDailyDetails->count()) }} baris</span>
    </div>
    <p class="muted-line">Gunakan export CSV untuk diserahkan ke tim finance/owner.</p>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Waktu Bayar</th>
                <th>Order</th>
                <th>Outlet</th>
                <th>Metode</th>
                <th>Nominal</th>
                <th>Sisa Order</th>
            </tr>
            </thead>
            <tbody>
            @forelse($cashDailyDetails as $row)
                <tr>
                    <td>{{ $row['paid_at'] }}</td>
                    <td>
                        <p class="row-title">{{ $row['invoice_or_order_code'] }}</p>
                        <p class="row-subtitle">{{ $row['order_code'] }}</p>
                    </td>
                    <td>
                        <p class="row-title">{{ $row['outlet_name'] }}</p>
                        <p class="row-subtitle">{{ $row['outlet_code'] }}</p>
                    </td>
                    <td>{{ strtoupper((string) $row['payment_method']) }}</td>
                    <td>Rp{{ number_format((int) $row['payment_amount']) }}</td>
                    <td>Rp{{ number_format((int) $row['order_due_amount']) }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Belum ada pembayaran pada tanggal ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Performa Outlet (Periode {{ $period }})</h3>
        <span class="status-badge status-neutral">Sesuai Scope Akses</span>
    </div>
    <p class="muted-line">Ringkasan outlet: {{ $selectedOutletLabel ?? 'Semua Outlet Scope' }}</p>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Outlet</th>
                <th>Order</th>
                <th>Bruto</th>
                <th>Piutang</th>
            </tr>
            </thead>
            <tbody>
            @forelse($outletSummary as $row)
                <tr>
                    <td>{{ $row['outlet_name'] }}</td>
                    <td>{{ number_format((int) $row['orders_count']) }}</td>
                    <td>Rp{{ number_format((int) $row['gross_amount']) }}</td>
                    <td>Rp{{ number_format((int) $row['due_amount']) }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="4">Belum ada transaksi pada periode ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
