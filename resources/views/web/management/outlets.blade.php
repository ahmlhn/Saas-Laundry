@extends('web.layouts.app', ['title' => 'Outlet'])

@php
    $ordersTotal = (int) $rows->sum('orders_count');
    $ordersThisMonth = (int) $rows->sum('orders_this_month_count');
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Data Master</p>
        <h3>Manajemen Outlet</h3>
        <p>Kelola struktur outlet aktif, pantau performa volume pesanan, dan kontrol siklus arsip-pemulihan untuk menjaga kontinuitas operasional tenant.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Outlet Aktif</p>
            <p class="hero-kpi-value">{{ number_format($rows->count()) }}</p>
            <p class="hero-kpi-note">Dalam cakupan tenant</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Total Pesanan</p>
            <p class="hero-kpi-value">{{ number_format($ordersTotal) }}</p>
            <p class="hero-kpi-note">Akumulasi outlet aktif</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pesanan Bulan Ini</p>
            <p class="hero-kpi-value">{{ number_format($ordersThisMonth) }}</p>
            <p class="hero-kpi-note">Ringkasan bulan berjalan</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Outlet Aktif</p>
        <h3 class="metric-value">{{ number_format($rows->count()) }}</h3>
        <p class="muted-line">Outlet aktif tenant scope</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Outlet Diarsipkan</p>
        <h3 class="metric-value">{{ number_format($archivedRows->count()) }}</h3>
        <p class="muted-line">Pulihkan hanya mode pemilik</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Total Pesanan</p>
        <h3 class="metric-value">{{ number_format($ordersTotal) }}</h3>
        <p class="muted-line">Akumulasi dari outlet aktif</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Pesanan Bulan Ini</p>
        <h3 class="metric-value">{{ number_format($ordersThisMonth) }}</h3>
        <p class="muted-line">Ringkasan bulan berjalan</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Outlet Aktif</h3>
        <p class="muted-line">{{ number_format($rows->count()) }} outlet</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Zona Waktu</th>
                <th>Total Pesanan</th>
                <th>Pesanan Bulan Ini</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $outlet)
                <tr>
                    <td><span class="chip">{{ $outlet->code }}</span></td>
                    <td><p class="row-title">{{ $outlet->name }}</p></td>
                    <td>{{ $outlet->timezone }}</td>
                    <td>{{ number_format($outlet->orders_count) }}</td>
                    <td>{{ number_format($outlet->orders_this_month_count) }}</td>
                    <td>
                        @if($ownerMode)
                            <form method="POST" action="{{ route('tenant.outlets.archive', ['tenant' => $tenant->id, 'outlet' => $outlet->id]) }}" class="inline-form">
                                @csrf
                                <button type="submit" class="btn btn-danger btn-sm">Arsipkan</button>
                            </form>
                        @else
                            <span class="muted-line">Hanya baca</span>
                        @endif
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Belum ada outlet aktif.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

@if($ownerMode)
<section class="panel-section">
    <div class="section-head">
        <h3>Outlet Diarsipkan</h3>
        <p class="muted-line">{{ number_format($archivedRows->count()) }} outlet</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Zona Waktu</th>
                <th>Diarsipkan Pada</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($archivedRows as $outlet)
                <tr>
                    <td><span class="chip">{{ $outlet->code }}</span></td>
                    <td><p class="row-title">{{ $outlet->name }}</p></td>
                    <td>{{ $outlet->timezone }}</td>
                    <td>{{ optional($outlet->deleted_at)->format('d M Y H:i') }}</td>
                    <td>
                        <form method="POST" action="{{ route('tenant.outlets.restore', ['tenant' => $tenant->id, 'outlet' => $outlet->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-muted btn-sm">Pulihkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5">Belum ada outlet terarsip.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
@endif
</div>
@endsection
