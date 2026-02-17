@extends('web.layouts.app', ['title' => 'Layanan'])

@php
    $activeCount = $rows->where('active', true)->count();
    $inactiveCount = $rows->where('active', false)->count();
    $avgPrice = (int) round($rows->avg('base_price_amount') ?? 0);
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Data Master</p>
        <h3>Manajemen Layanan</h3>
        <p>Standarkan katalog layanan dan harga dasar agar proses order, override outlet, serta pelaporan berjalan konsisten di seluruh cabang.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Layanan Aktif</p>
            <p class="hero-kpi-value">{{ number_format($activeCount) }}</p>
            <p class="hero-kpi-note">Siap dipakai transaksi</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Layanan Nonaktif</p>
            <p class="hero-kpi-value">{{ number_format($inactiveCount) }}</p>
            <p class="hero-kpi-note">Perlu evaluasi katalog</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Rata-rata Harga</p>
            <p class="hero-kpi-value">Rp{{ number_format($avgPrice) }}</p>
            <p class="hero-kpi-note">Dari layanan aktif</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Layanan Aktif</p>
        <h3 class="metric-value">{{ number_format($activeCount) }}</h3>
        <p class="muted-line">Layanan siap dipakai pesanan</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Layanan Nonaktif</p>
        <h3 class="metric-value">{{ number_format($inactiveCount) }}</h3>
        <p class="muted-line">Perlu review katalog</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Layanan Diarsipkan</p>
        <h3 class="metric-value">{{ number_format($archivedRows->count()) }}</h3>
        <p class="muted-line">Data historis non-aktif</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Rata-rata Harga Dasar</p>
        <h3 class="metric-value">Rp{{ number_format($avgPrice) }}</h3>
        <p class="muted-line">Rata-rata layanan aktif</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Layanan Aktif</h3>
        <p class="muted-line">{{ number_format($rows->count()) }} layanan</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Nama</th>
                <th>Unit</th>
                <th>Harga Dasar</th>
                <th>Status</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $row)
                <tr>
                    <td><p class="row-title">{{ $row->name }}</p></td>
                    <td>{{ $row->unit_type }}</td>
                    <td>Rp {{ number_format($row->base_price_amount) }}</td>
                    <td>
                        <span class="status-badge {{ $row->active ? 'status-success' : 'status-neutral' }}">{{ $row->active ? 'aktif' : 'nonaktif' }}</span>
                    </td>
                    <td>
                        <form method="POST" action="{{ route('tenant.services.archive', ['tenant' => $tenant->id, 'service' => $row->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-danger btn-sm">Arsipkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5">Belum ada layanan aktif.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Layanan Diarsipkan</h3>
        <p class="muted-line">{{ number_format($archivedRows->count()) }} layanan</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Nama</th>
                <th>Unit</th>
                <th>Harga Dasar</th>
                <th>Diarsipkan Pada</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($archivedRows as $row)
                <tr>
                    <td><p class="row-title">{{ $row->name }}</p></td>
                    <td>{{ $row->unit_type }}</td>
                    <td>Rp {{ number_format($row->base_price_amount) }}</td>
                    <td>{{ optional($row->deleted_at)->format('d M Y H:i') }}</td>
                    <td>
                        <form method="POST" action="{{ route('tenant.services.restore', ['tenant' => $tenant->id, 'service' => $row->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-muted btn-sm">Pulihkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5">Belum ada layanan terarsip.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
