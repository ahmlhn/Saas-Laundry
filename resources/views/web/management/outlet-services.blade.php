@extends('web.layouts.app', ['title' => 'Layanan Outlet'])

@php
    $activeCount = $activeRows->count();
    $inactiveCount = $inactiveRows->count();
    $avgOverride = (int) round($rows->whereNotNull('price_override_amount')->avg('price_override_amount') ?? 0);
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Harga per Outlet</p>
        <h3>Manajemen Layanan Outlet</h3>
        <p>Atur override harga dan SLA per outlet agar strategi layanan tetap fleksibel tanpa kehilangan konsistensi katalog tenant.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Override Aktif</p>
            <p class="hero-kpi-value">{{ number_format($activeCount) }}</p>
            <p class="hero-kpi-note">Layanan outlet aktif</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Outlet Cakupan</p>
            <p class="hero-kpi-value">{{ number_format($outlets->count()) }}</p>
            <p class="hero-kpi-note">Outlet yang bisa dikelola</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Rata-rata Override</p>
            <p class="hero-kpi-value">Rp{{ number_format($avgOverride) }}</p>
            <p class="hero-kpi-note">Harga override saat ini</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Override Aktif</p>
        <h3 class="metric-value">{{ number_format($activeCount) }}</h3>
        <p class="muted-line">Override aktif per layanan outlet</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Override Nonaktif</p>
        <h3 class="metric-value">{{ number_format($inactiveCount) }}</h3>
        <p class="muted-line">Override nonaktif</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Outlet Dalam Cakupan</p>
        <h3 class="metric-value">{{ number_format($outlets->count()) }}</h3>
        <p class="muted-line">Outlet yang bisa dikelola</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Rata-rata Override</p>
        <h3 class="metric-value">Rp{{ number_format($avgOverride) }}</h3>
        <p class="muted-line">Rata-rata harga override</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Filter Override</h3>
        <p class="muted-line">Filter outlet, status override, status layanan, tipe harga override, dan nama layanan.</p>
    </div>

    <form method="GET" class="filters-grid">
        <div>
            <label for="outlet_filter">Outlet</label>
            <select id="outlet_filter" name="outlet_id">
                <option value="">Semua Outlet</option>
                @foreach($outlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(($filters['outlet_id'] ?? '') === $outlet->id)>
                        {{ $outlet->name }} ({{ $outlet->code }})
                    </option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="active_filter">Status</label>
            <select id="active_filter" name="active">
                <option value="">Semua</option>
                <option value="1" @selected((string)($filters['active'] ?? '') === '1')>Aktif</option>
                <option value="0" @selected((string)($filters['active'] ?? '') === '0')>Nonaktif</option>
            </select>
        </div>
        <div>
            <label for="search_filter">Cari Layanan</label>
            <input id="search_filter" type="text" name="search" value="{{ $filters['search'] ?? '' }}" placeholder="nama layanan">
        </div>
        <div>
            <label for="service_active_filter">Status Layanan</label>
            <select id="service_active_filter" name="service_active">
                <option value="">Semua</option>
                <option value="1" @selected((string)($filters['service_active'] ?? '') === '1')>Layanan Aktif</option>
                <option value="0" @selected((string)($filters['service_active'] ?? '') === '0')>Layanan Nonaktif</option>
            </select>
        </div>
        <div>
            <label for="override_price_filter">Harga Override</label>
            <select id="override_price_filter" name="override_price">
                <option value="">Semua</option>
                <option value="has" @selected(($filters['override_price'] ?? '') === 'has')>Ada Override</option>
                <option value="none" @selected(($filters['override_price'] ?? '') === 'none')>Tanpa Override</option>
            </select>
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Filter</button>
            <a class="btn btn-ghost" href="{{ route('tenant.outlet-services.index', ['tenant' => $tenant->id]) }}">Atur Ulang</a>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Buat / Perbarui Override</h3>
        <p class="muted-line">Jika layanan outlet sudah ada, data akan diperbarui.</p>
    </div>

    <form method="POST" action="{{ route('tenant.outlet-services.upsert', ['tenant' => $tenant->id]) }}" class="filters-grid">
        @csrf
        <div>
            <label for="form_outlet_id">Outlet</label>
            <select id="form_outlet_id" name="outlet_id" required>
                <option value="">Pilih outlet</option>
                @foreach($outlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(old('outlet_id') === $outlet->id)>
                        {{ $outlet->name }} ({{ $outlet->code }})
                    </option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="form_service_id">Layanan</label>
            <select id="form_service_id" name="service_id" required>
                <option value="">Pilih layanan</option>
                @foreach($services as $service)
                    <option value="{{ $service->id }}" @selected(old('service_id') === $service->id)>
                        {{ $service->name }} ({{ $service->unit_type }}) - dasar Rp{{ number_format($service->base_price_amount) }}
                    </option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="form_price">Harga Override</label>
            <input id="form_price" type="number" min="0" name="price_override_amount" value="{{ old('price_override_amount') }}" placeholder="kosong = gunakan harga dasar">
        </div>
        <div>
            <label for="form_sla">SLA Override</label>
            <input id="form_sla" type="text" name="sla_override" value="{{ old('sla_override') }}" maxlength="100" placeholder="contoh: 24 jam">
        </div>
        <div>
            <label for="form_active">Status</label>
            <select id="form_active" name="active">
                <option value="1" @selected((string) old('active', '1') === '1')>Aktif</option>
                <option value="0" @selected((string) old('active') === '0')>Nonaktif</option>
            </select>
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Simpan Override</button>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Override Layanan Outlet</h3>
        <p class="muted-line">{{ number_format($rows->count()) }} baris</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Outlet</th>
                <th>Layanan</th>
                <th>Status Layanan</th>
                <th>Harga Dasar</th>
                <th>Harga Override</th>
                <th>SLA</th>
                <th>Status</th>
                <th>Perbarui</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $row)
                <tr>
                    <td>{{ $row->outlet?->name ?: '-' }}</td>
                    <td>
                        <p class="row-title">{{ $row->service?->name ?: '-' }}</p>
                        <p class="row-subtitle">{{ $row->service?->unit_type ?: '-' }}</p>
                    </td>
                    <td>
                        <span class="status-badge {{ ($row->service?->active ?? false) ? 'status-success' : 'status-neutral' }}">
                            {{ ($row->service?->active ?? false) ? 'layanan aktif' : 'layanan nonaktif' }}
                        </span>
                    </td>
                    <td>Rp{{ number_format((int) ($row->service?->base_price_amount ?? 0)) }}</td>
                    <td>{{ $row->price_override_amount !== null ? 'Rp'.number_format((int) $row->price_override_amount) : 'harga dasar' }}</td>
                    <td>{{ $row->sla_override ?: '-' }}</td>
                    <td>
                        <span class="status-badge {{ $row->active ? 'status-success' : 'status-neutral' }}">
                            {{ $row->active ? 'aktif' : 'nonaktif' }}
                        </span>
                    </td>
                    <td>
                        <form method="POST" action="{{ route('tenant.outlet-services.update', ['tenant' => $tenant->id, 'outletService' => $row->id]) }}" class="filters-grid" style="grid-template-columns: repeat(4, minmax(0, 1fr));">
                            @csrf
                            <div>
                                <label>Status</label>
                                <select name="active">
                                    <option value="1" @selected($row->active)>Aktif</option>
                                    <option value="0" @selected(! $row->active)>Nonaktif</option>
                                </select>
                            </div>
                            <div>
                                <label>Harga</label>
                                <input type="number" min="0" name="price_override_amount" value="{{ $row->price_override_amount ?? '' }}" placeholder="dasar">
                            </div>
                            <div>
                                <label>SLA</label>
                                <input type="text" name="sla_override" maxlength="100" value="{{ $row->sla_override ?? '' }}" placeholder="opsional">
                            </div>
                            <div class="filter-actions" style="align-items: end;">
                                <button type="submit" class="btn btn-muted btn-sm">Perbarui</button>
                            </div>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="8">Belum ada override layanan outlet pada filter ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
