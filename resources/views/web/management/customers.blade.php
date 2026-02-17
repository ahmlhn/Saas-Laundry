@extends('web.layouts.app', ['title' => 'Pelanggan'])

@php
    $withNotesCount = $rows->filter(fn ($row) => filled($row->notes))->count();
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Data Master</p>
        <h3>Manajemen Pelanggan</h3>
        <p>Jaga kualitas data pelanggan untuk mendukung repeat order, notifikasi, dan histori layanan yang akurat per tenant.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pelanggan Aktif</p>
            <p class="hero-kpi-value">{{ number_format($rows->count()) }}</p>
            <p class="hero-kpi-note">Siap dipakai transaksi</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Diarsipkan</p>
            <p class="hero-kpi-value">{{ number_format($archivedRows->count()) }}</p>
            <p class="hero-kpi-note">Bisa dipulihkan kapan saja</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Nomor Unik</p>
            <p class="hero-kpi-value">{{ number_format($rows->pluck('phone_normalized')->filter()->unique()->count()) }}</p>
            <p class="hero-kpi-note">Kontak ternormalisasi</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Pelanggan Aktif</p>
        <h3 class="metric-value">{{ number_format($rows->count()) }}</h3>
        <p class="muted-line">Pelanggan aktif tenant</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Pelanggan Diarsipkan</p>
        <h3 class="metric-value">{{ number_format($archivedRows->count()) }}</h3>
        <p class="muted-line">Dapat dipulihkan kapan saja</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Dengan Catatan</p>
        <h3 class="metric-value">{{ number_format($withNotesCount) }}</h3>
        <p class="muted-line">Catatan preferensi tersimpan</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Nomor Unik</p>
        <h3 class="metric-value">{{ number_format($rows->pluck('phone_normalized')->filter()->unique()->count()) }}</h3>
        <p class="muted-line">Nomor aktif ter-normalisasi</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Pelanggan Aktif</h3>
        <p class="muted-line">{{ number_format($rows->count()) }} pelanggan</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Nama</th>
                <th>Nomor Telepon</th>
                <th>Catatan</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $row)
                <tr>
                    <td><p class="row-title">{{ $row->name }}</p></td>
                    <td>{{ $row->phone_normalized }}</td>
                    <td>{{ $row->notes ?: '-' }}</td>
                    <td>
                        <form method="POST" action="{{ route('tenant.customers.archive', ['tenant' => $tenant->id, 'customer' => $row->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-danger btn-sm">Arsipkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="4">Belum ada pelanggan aktif.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Pelanggan Diarsipkan</h3>
        <p class="muted-line">{{ number_format($archivedRows->count()) }} pelanggan</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Nama</th>
                <th>Nomor Telepon</th>
                <th>Diarsipkan Pada</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($archivedRows as $row)
                <tr>
                    <td><p class="row-title">{{ $row->name }}</p></td>
                    <td>{{ $row->phone_normalized }}</td>
                    <td>{{ optional($row->deleted_at)->format('d M Y H:i') }}</td>
                    <td>
                        <form method="POST" action="{{ route('tenant.customers.restore', ['tenant' => $tenant->id, 'customer' => $row->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-muted btn-sm">Pulihkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="4">Belum ada pelanggan terarsip.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
