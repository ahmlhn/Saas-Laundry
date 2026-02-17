@extends('web.layouts.app', ['title' => 'Zona Pengantaran'])

@php
    $activeCount = $activeRows->count();
    $inactiveCount = $inactiveRows->count();
    $avgFee = (int) round($rows->avg('fee_amount') ?? 0);
    $avgEta = (int) round($activeRows->avg('eta_minutes') ?? 0);
    $distanceLabel = function ($zone): string {
        $min = $zone->min_distance_km;
        $max = $zone->max_distance_km;

        if ($min === null && $max === null) {
            return '-';
        }

        if ($min !== null && $max !== null) {
            return number_format((float) $min, 2).' - '.number_format((float) $max, 2).' km';
        }

        if ($min !== null) {
            return '>= '.number_format((float) $min, 2).' km';
        }

        return '<= '.number_format((float) $max, 2).' km';
    };
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Pickup & Delivery</p>
        <h3>Manajemen Zona Pengantaran</h3>
        <p>Definisikan cakupan jarak, ongkir, dan ETA per outlet untuk memastikan biaya antar-jemput konsisten serta transparan ke pelanggan.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Zona Aktif</p>
            <p class="hero-kpi-value">{{ number_format($activeCount) }}</p>
            <p class="hero-kpi-note">Siap dipakai order pickup-delivery</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Rata-rata Ongkir</p>
            <p class="hero-kpi-value">Rp{{ number_format($avgFee) }}</p>
            <p class="hero-kpi-note">Dari seluruh zona terdata</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Rata-rata ETA</p>
            <p class="hero-kpi-value">{{ number_format($avgEta) }} min</p>
            <p class="hero-kpi-note">Per zona aktif dengan ETA</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Zona Aktif</p>
        <h3 class="metric-value">{{ number_format($activeCount) }}</h3>
        <p class="muted-line">Siap untuk tarif antar-jemput</p>
    </article>
    <article class="metric-card is-warning">
        <p class="metric-label">Zona Nonaktif</p>
        <h3 class="metric-value">{{ number_format($inactiveCount) }}</h3>
        <p class="muted-line">Perlu reaktivasi saat dibutuhkan</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Rata-rata Ongkir</p>
        <h3 class="metric-value">Rp{{ number_format($avgFee) }}</h3>
        <p class="muted-line">Rata-rata ongkir seluruh zona</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Rata-rata ETA</p>
        <h3 class="metric-value">{{ number_format($avgEta) }} min</h3>
        <p class="muted-line">Dari zona aktif dengan ETA</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Filter Zona Pengantaran</h3>
        <p class="muted-line">Filter berdasarkan outlet, status, dan nama zona.</p>
    </div>

    <form method="GET" class="filters-grid">
        <div>
            <label for="zone_filter_outlet">Outlet</label>
            <select id="zone_filter_outlet" name="outlet_id">
                <option value="">Semua Outlet</option>
                @foreach($outlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(($filters['outlet_id'] ?? '') === $outlet->id)>
                        {{ $outlet->name }} ({{ $outlet->code }})
                    </option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="zone_filter_active">Status</label>
            <select id="zone_filter_active" name="active">
                <option value="">Semua</option>
                <option value="1" @selected((string) ($filters['active'] ?? '') === '1')>Aktif</option>
                <option value="0" @selected((string) ($filters['active'] ?? '') === '0')>Nonaktif</option>
            </select>
        </div>
        <div>
            <label for="zone_filter_search">Cari Zona</label>
            <input id="zone_filter_search" type="text" name="search" value="{{ $filters['search'] ?? '' }}" placeholder="nama zona">
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Filter</button>
            <a class="btn btn-ghost" href="{{ route('tenant.shipping-zones.index', ['tenant' => $tenant->id]) }}">Atur Ulang</a>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Buat Zona Pengantaran</h3>
        <p class="muted-line">Buat tarif antar-jemput per outlet.</p>
    </div>

    <form method="POST" action="{{ route('tenant.shipping-zones.store', ['tenant' => $tenant->id]) }}" class="filters-grid">
        @csrf
        <div>
            <label for="outlet_id">Outlet</label>
            <select id="outlet_id" name="outlet_id" required>
                <option value="">Pilih outlet</option>
                @foreach($outlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected(old('outlet_id') === $outlet->id)>
                        {{ $outlet->name }} ({{ $outlet->code }})
                    </option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="zone_name">Nama Zona</label>
            <input id="zone_name" type="text" name="name" value="{{ old('name') }}" maxlength="120" placeholder="Zona Ring 1" required>
        </div>
        <div>
            <label for="min_distance_km">Jarak Minimum (km)</label>
            <input id="min_distance_km" type="number" step="0.01" min="0" name="min_distance_km" value="{{ old('min_distance_km') }}" placeholder="0">
        </div>
        <div>
            <label for="max_distance_km">Jarak Maksimum (km)</label>
            <input id="max_distance_km" type="number" step="0.01" min="0" name="max_distance_km" value="{{ old('max_distance_km') }}" placeholder="5">
        </div>
        <div>
            <label for="fee_amount">Jumlah Ongkir</label>
            <input id="fee_amount" type="number" min="0" name="fee_amount" value="{{ old('fee_amount') }}" placeholder="10000" required>
        </div>
        <div>
            <label for="eta_minutes">ETA (menit)</label>
            <input id="eta_minutes" type="number" min="1" max="10000" name="eta_minutes" value="{{ old('eta_minutes') }}" placeholder="30">
        </div>
        <div>
            <label for="active">Status</label>
            <select id="active" name="active">
                <option value="1" @selected((string) old('active', '1') === '1')>Aktif</option>
                <option value="0" @selected((string) old('active') === '0')>Nonaktif</option>
            </select>
        </div>
        <div>
            <label for="notes">Catatan</label>
            <input id="notes" type="text" name="notes" value="{{ old('notes') }}" placeholder="Opsional catatan zona">
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Buat Zona</button>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Ubah Zona Pengantaran</h3>
        <p class="muted-line">Perbarui parameter zona tanpa mengubah outlet asal.</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Outlet</th>
                <th>Zona</th>
                <th>Saat Ini</th>
                <th>Form Perbarui</th>
            </tr>
            </thead>
            <tbody>
            @forelse($rows as $zone)
                <tr>
                    <td>{{ $zone->outlet?->name ?: '-' }}</td>
                    <td>
                        <p class="row-title">{{ $zone->name }}</p>
                        <p class="row-subtitle">{{ $zone->notes ?: '-' }}</p>
                    </td>
                    <td>
                        <p class="row-title">Ongkir Rp{{ number_format((int) $zone->fee_amount) }}</p>
                        <p class="row-subtitle">{{ $distanceLabel($zone) }} · {{ $zone->eta_minutes ? number_format((int) $zone->eta_minutes).' min' : '-' }}</p>
                        <span class="status-badge {{ $zone->active ? 'status-success' : 'status-neutral' }}">{{ $zone->active ? 'aktif' : 'nonaktif' }}</span>
                    </td>
                    <td>
                        <form method="POST" action="{{ route('tenant.shipping-zones.update', ['tenant' => $tenant->id, 'zone' => $zone->id]) }}" class="filters-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
                            @csrf
                            <div>
                                <label>Nama</label>
                                <input type="text" name="name" value="{{ $zone->name }}" maxlength="120" required>
                            </div>
                            <div>
                                <label>Jarak Min</label>
                                <input type="number" step="0.01" min="0" name="min_distance_km" value="{{ $zone->min_distance_km ?? '' }}">
                            </div>
                            <div>
                                <label>Jarak Maks</label>
                                <input type="number" step="0.01" min="0" name="max_distance_km" value="{{ $zone->max_distance_km ?? '' }}">
                            </div>
                            <div>
                                <label>Ongkir</label>
                                <input type="number" min="0" name="fee_amount" value="{{ (int) $zone->fee_amount }}" required>
                            </div>
                            <div>
                                <label>ETA</label>
                                <input type="number" min="1" max="10000" name="eta_minutes" value="{{ $zone->eta_minutes ?? '' }}">
                            </div>
                            <div>
                                <label>Catatan</label>
                                <input type="text" name="notes" value="{{ $zone->notes ?? '' }}" placeholder="opsional">
                            </div>
                            <div class="filter-actions">
                                <button class="btn btn-muted btn-sm" type="submit">Perbarui Zona</button>
                            </div>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="4">Belum ada zona pengantaran pada filter ini.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Zona Pengantaran Aktif</h3>
        <p class="muted-line">{{ number_format($activeCount) }} zona</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Outlet</th>
                <th>Zona</th>
                <th>Jarak</th>
                <th>Ongkir</th>
                <th>ETA</th>
                <th>Status</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($activeRows as $zone)
                <tr>
                    <td>{{ $zone->outlet?->name ?: '-' }}</td>
                    <td>
                        <p class="row-title">{{ $zone->name }}</p>
                        <p class="row-subtitle">{{ $zone->notes ?: '-' }}</p>
                    </td>
                    <td>{{ $distanceLabel($zone) }}</td>
                    <td>Rp{{ number_format($zone->fee_amount) }}</td>
                    <td>{{ $zone->eta_minutes ? number_format((int) $zone->eta_minutes).' min' : '-' }}</td>
                    <td><span class="status-badge status-success">aktif</span></td>
                    <td>
                        <form method="POST" action="{{ route('tenant.shipping-zones.deactivate', ['tenant' => $tenant->id, 'zone' => $zone->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-danger btn-sm">Nonaktifkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="7">Belum ada zona pengantaran aktif.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Zona Pengantaran Nonaktif</h3>
        <p class="muted-line">{{ number_format($inactiveCount) }} zona</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Outlet</th>
                <th>Zona</th>
                <th>Jarak</th>
                <th>Ongkir</th>
                <th>ETA</th>
                <th>Status</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($inactiveRows as $zone)
                <tr>
                    <td>{{ $zone->outlet?->name ?: '-' }}</td>
                    <td>
                        <p class="row-title">{{ $zone->name }}</p>
                        <p class="row-subtitle">{{ $zone->notes ?: '-' }}</p>
                    </td>
                    <td>{{ $distanceLabel($zone) }}</td>
                    <td>Rp{{ number_format($zone->fee_amount) }}</td>
                    <td>{{ $zone->eta_minutes ? number_format((int) $zone->eta_minutes).' min' : '-' }}</td>
                    <td><span class="status-badge status-neutral">nonaktif</span></td>
                    <td>
                        <form method="POST" action="{{ route('tenant.shipping-zones.activate', ['tenant' => $tenant->id, 'zone' => $zone->id]) }}" class="inline-form">
                            @csrf
                            <button type="submit" class="btn btn-muted btn-sm">Aktifkan</button>
                        </form>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="7">Belum ada zona pengantaran nonaktif.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
