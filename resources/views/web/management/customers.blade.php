@extends('web.layouts.app', ['title' => 'Pelanggan'])

@php
    $search = $filters['search'] ?? '';
    $limit = (int) ($filters['limit'] ?? 20);
    $activeFilteredCount = $rows->total();
    $archivedFilteredCount = $archivedRows->total();
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Data Master</p>
        <h3>Manajemen Pelanggan</h3>
        <p>Kelola basis pelanggan tenant dari panel web untuk mempercepat input order, menjaga kualitas kontak, dan merapikan data pelanggan yang aktif maupun terarsip.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pelanggan Aktif</p>
            <p class="hero-kpi-value">{{ number_format((int) ($summary['active_total'] ?? 0)) }}</p>
            <p class="hero-kpi-note">Basis pelanggan siap transaksi</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Terfilter</p>
            <p class="hero-kpi-value">{{ number_format($activeFilteredCount) }}</p>
            <p class="hero-kpi-note">{{ filled($search) ? 'Hasil pencarian aktif' : 'Baris aktif di tampilan' }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Nomor Unik</p>
            <p class="hero-kpi-value">{{ number_format((int) ($summary['unique_phone_total'] ?? 0)) }}</p>
            <p class="hero-kpi-note">Kontak ternormalisasi</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Pelanggan Aktif</p>
        <h3 class="metric-value">{{ number_format((int) ($summary['active_total'] ?? 0)) }}</h3>
        <p class="muted-line">Siap dipakai transaksi baru</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Pelanggan Diarsipkan</p>
        <h3 class="metric-value">{{ number_format((int) ($summary['archived_total'] ?? 0)) }}</h3>
        <p class="muted-line">Bisa dipulihkan kapan saja</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Dengan Catatan</p>
        <h3 class="metric-value">{{ number_format((int) ($summary['with_notes_total'] ?? 0)) }}</h3>
        <p class="muted-line">Preferensi pelanggan tersimpan</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Nomor Unik</p>
        <h3 class="metric-value">{{ number_format((int) ($summary['unique_phone_total'] ?? 0)) }}</h3>
        <p class="muted-line">Kontak aktif tanpa duplikasi</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Filter Pelanggan</h3>
        <p class="muted-line">Cari berdasarkan nama, nomor telepon, atau catatan.</p>
    </div>

    <form method="GET" class="filters-grid">
        <div>
            <label for="customer_filter_search">Pencarian</label>
            <input id="customer_filter_search" type="text" name="search" value="{{ $search }}" placeholder="nama / telepon / catatan">
        </div>
        <div>
            <label for="customer_filter_limit">Baris per tabel</label>
            <select id="customer_filter_limit" name="limit">
                @foreach([10, 20, 30, 50, 100] as $rowLimit)
                    <option value="{{ $rowLimit }}" @selected($limit === $rowLimit)>{{ $rowLimit }}</option>
                @endforeach
            </select>
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Filter</button>
            <a class="btn btn-ghost" href="{{ route('tenant.customers.index') }}">Atur Ulang</a>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Tambah Pelanggan</h3>
        <p class="muted-line">Jika nomor telepon sudah ada, sistem akan memperbarui data pelanggan yang sama.</p>
    </div>

    <form method="POST" action="{{ route('tenant.customers.store', $filters) }}" class="filters-grid">
        @csrf
        <div>
            <label for="customer_name">Nama Pelanggan</label>
            <input id="customer_name" type="text" name="name" value="{{ old('name') }}" maxlength="150" required>
        </div>
        <div>
            <label for="customer_phone">Nomor Telepon</label>
            <input id="customer_phone" type="text" name="phone" value="{{ old('phone') }}" maxlength="30" placeholder="0812xxxx" required>
        </div>
        <div style="grid-column: 1 / -1;">
            <label for="customer_notes">Catatan</label>
            <textarea id="customer_notes" name="notes" rows="3" placeholder="opsional">{{ old('notes') }}</textarea>
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Simpan Pelanggan</button>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Pelanggan Aktif</h3>
            <p class="muted-line">{{ number_format($activeFilteredCount) }} pelanggan{{ filled($search) ? ' sesuai filter' : '' }}</p>
        </div>
        <span class="status-badge status-info">{{ number_format($rows->count()) }} baris di halaman ini</span>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Pelanggan</th>
                <th>Kontak</th>
                <th>Aktivitas</th>
                <th>Form Perbarui</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $row)
                @php
                    $lastOrderAt = filled($row->orders_max_created_at)
                        ? \Illuminate\Support\Carbon::parse($row->orders_max_created_at)->format('d M Y H:i')
                        : 'Belum ada transaksi';
                @endphp
                <tr>
                    <td>
                        <p class="row-title">{{ $row->name }}</p>
                        <p class="row-subtitle">Diperbarui {{ optional($row->updated_at)->format('d M Y H:i') }}</p>
                    </td>
                    <td>
                        <p class="row-title">{{ $row->phone_normalized }}</p>
                        <p class="row-subtitle">{{ filled($row->notes) ? $row->notes : 'Tanpa catatan' }}</p>
                    </td>
                    <td>
                        <p class="row-title">{{ number_format((int) $row->orders_count) }} order</p>
                        <p class="row-subtitle">Order terakhir {{ $lastOrderAt }}</p>
                    </td>
                    <td>
                        <form method="POST" action="{{ route('tenant.customers.update', array_merge(['customer' => $row->id], $filters)) }}" class="filters-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
                            @csrf
                            <div>
                                <label>Nama</label>
                                <input type="text" name="name" value="{{ $row->name }}" maxlength="150" required>
                            </div>
                            <div>
                                <label>Telepon</label>
                                <input type="text" name="phone" value="{{ $row->phone_normalized }}" maxlength="30" required>
                            </div>
                            <div>
                                <label>Catatan</label>
                                <input type="text" name="notes" value="{{ $row->notes ?? '' }}" maxlength="500" placeholder="opsional">
                            </div>
                            <div class="filter-actions">
                                <button type="submit" class="btn btn-muted btn-sm">Perbarui</button>
                            </div>
                        </form>
                    </td>
                    <td>
                        <form method="POST" action="{{ route('tenant.customers.archive', array_merge(['customer' => $row->id], $filters)) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-danger btn-sm">Arsipkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5">{{ filled($search) ? 'Tidak ada pelanggan aktif yang cocok dengan filter.' : 'Belum ada pelanggan aktif.' }}</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>

    @if($rows->hasPages())
        <div class="pagination-wrap">
            {{ $rows->links() }}
        </div>
    @endif
</section>

<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Pelanggan Diarsipkan</h3>
            <p class="muted-line">{{ number_format($archivedFilteredCount) }} pelanggan{{ filled($search) ? ' sesuai filter' : '' }}</p>
        </div>
        <span class="status-badge status-neutral">{{ number_format($archivedRows->count()) }} baris di halaman ini</span>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Pelanggan</th>
                <th>Kontak</th>
                <th>Aktivitas</th>
                <th>Diarsipkan Pada</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($archivedRows as $row)
                @php
                    $archivedLastOrderAt = filled($row->orders_max_created_at)
                        ? \Illuminate\Support\Carbon::parse($row->orders_max_created_at)->format('d M Y H:i')
                        : 'Belum ada transaksi';
                @endphp
                <tr>
                    <td>
                        <p class="row-title">{{ $row->name }}</p>
                        <p class="row-subtitle">{{ filled($row->notes) ? $row->notes : 'Tanpa catatan' }}</p>
                    </td>
                    <td>{{ $row->phone_normalized }}</td>
                    <td>
                        <p class="row-title">{{ number_format((int) $row->orders_count) }} order</p>
                        <p class="row-subtitle">Order terakhir {{ $archivedLastOrderAt }}</p>
                    </td>
                    <td>{{ optional($row->deleted_at)->format('d M Y H:i') }}</td>
                    <td>
                        <form method="POST" action="{{ route('tenant.customers.restore', array_merge(['customer' => $row->id], $filters)) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-muted btn-sm">Pulihkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="5">{{ filled($search) ? 'Tidak ada pelanggan arsip yang cocok dengan filter.' : 'Belum ada pelanggan terarsip.' }}</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>

    @if($archivedRows->hasPages())
        <div class="pagination-wrap">
            {{ $archivedRows->links() }}
        </div>
    @endif
</section>
</div>
@endsection
