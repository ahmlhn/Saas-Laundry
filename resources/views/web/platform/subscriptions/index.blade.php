@extends('web.platform.layouts.app', ['title' => 'Tenant Subscriptions'])

@section('content')
<section class="panel-section">
    <div class="section-head">
        <h3>Filter Tenant</h3>
    </div>
    <form method="GET" class="filters-grid">
        <div>
            <label for="q">Cari Tenant</label>
            <input id="q" type="text" name="q" value="{{ $filters['q'] ?? '' }}" placeholder="Nama/ID tenant">
        </div>
        <div>
            <label for="state">State</label>
            <select id="state" name="state">
                <option value="">Semua</option>
                <option value="active" @selected(($filters['state'] ?? null) === 'active')>Active</option>
                <option value="past_due" @selected(($filters['state'] ?? null) === 'past_due')>Past Due</option>
                <option value="suspended" @selected(($filters['state'] ?? null) === 'suspended')>Suspended</option>
            </select>
        </div>
        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Terapkan</button>
        </div>
    </form>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Daftar Tenant</h3>
        <span class="status-badge status-info">{{ number_format($tenants->total()) }} tenant</span>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Tenant</th>
                <th>Plan</th>
                <th>State</th>
                <th>Write Mode</th>
                <th>Cycle</th>
                <th>Aksi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($tenants as $tenant)
                <tr>
                    <td>
                        <p class="row-title">{{ $tenant->name }}</p>
                        <p class="row-subtitle">{{ $tenant->id }}</p>
                    </td>
                    <td>
                        {{ $tenant->currentPlan?->name ?? '-' }}
                        <p class="row-subtitle">{{ strtoupper((string) ($tenant->currentPlan?->key ?? '-')) }}</p>
                    </td>
                    <td>{{ strtoupper((string) ($tenant->subscription_state ?? 'active')) }}</td>
                    <td>{{ strtoupper((string) ($tenant->write_access_mode ?? 'full')) }}</td>
                    <td>
                        @if($tenant->currentSubscriptionCycle)
                            <p class="row-title">{{ $tenant->currentSubscriptionCycle->cycle_start_at?->format('d M Y') }} - {{ $tenant->currentSubscriptionCycle->cycle_end_at?->format('d M Y') }}</p>
                            <p class="row-subtitle">{{ strtoupper((string) $tenant->currentSubscriptionCycle->status) }}</p>
                        @else
                            <p class="row-subtitle">Belum ada cycle</p>
                        @endif
                    </td>
                    <td>
                        <a class="btn btn-muted" href="{{ route('platform.subscriptions.show', ['tenant' => $tenant->id]) }}">Buka</a>
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Data tenant tidak ditemukan.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
    <div style="margin-top: 12px;">
        {{ $tenants->links() }}
    </div>
</section>
@endsection
