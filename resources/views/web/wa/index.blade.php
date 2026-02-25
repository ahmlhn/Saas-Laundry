@extends('web.layouts.app', ['title' => 'WhatsApp'])

@php
    $messageStatusClass = function (string $status): string {
        return match ($status) {
            'sent', 'delivered' => 'status-success',
            'queued' => 'status-warning',
            'failed' => 'status-danger',
            default => 'status-neutral',
        };
    };

    $messageStatusLabel = function (string $status): string {
        return match ($status) {
            'queued' => 'dalam antrean',
            'sent' => 'terkirim',
            'delivered' => 'diterima',
            'failed' => 'gagal',
            default => str_replace('_', ' ', $status),
        };
    };

    $templateSourceLabel = function (string $source): string {
        return match ($source) {
            'default' => 'bawaan',
            'tenant_override' => 'override tenant',
            'outlet_override' => 'override outlet',
            default => str_replace('_', ' ', $source),
        };
    };
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Komunikasi Pelanggan</p>
        <h3>Kontrol Pusat WhatsApp</h3>
        <p>Atur provider, tinjau sumber template, dan evaluasi kualitas pengiriman pesan agar notifikasi operasional berjalan stabil di semua outlet.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Provider Aktif</p>
            <p class="hero-kpi-value">{{ number_format($providerSummary['active_count']) }}</p>
            <p class="hero-kpi-note">{{ $providerSummary['active_provider_key'] ? strtoupper($providerSummary['active_provider_key']) : 'belum dipilih' }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Template</p>
            <p class="hero-kpi-value">{{ number_format($templateSummary['total']) }}</p>
            <p class="hero-kpi-note">Override {{ number_format($templateSummary['override_count']) }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Rasio Gagal</p>
            <p class="hero-kpi-value">{{ $messageSummary['failure_rate'] }}%</p>
            <p class="hero-kpi-note">{{ number_format($messageSummary['failed']) }} gagal dari {{ number_format($messageSummary['total']) }} log</p>
        </article>
    </div>
</section>

<section class="metric-grid">
    <article class="metric-card is-primary">
        <p class="metric-label">Provider Terkonfigurasi</p>
        <h3 class="metric-value">{{ number_format($providerSummary['configured_count']) }}</h3>
        <p class="muted-line">Aktif: {{ number_format($providerSummary['active_count']) }} {{ $providerSummary['active_provider_key'] ? "({$providerSummary['active_provider_key']})" : '' }}</p>
    </article>
    <article class="metric-card is-info">
        <p class="metric-label">Template</p>
        <h3 class="metric-value">{{ number_format($templateSummary['total']) }}</h3>
        <p class="muted-line">Bawaan {{ number_format($templateSummary['default_count']) }} / Override {{ number_format($templateSummary['override_count']) }}</p>
    </article>
    <article class="metric-card is-success">
        <p class="metric-label">Pesan Berhasil</p>
        <h3 class="metric-value">{{ number_format($messageSummary['sent']) }}</h3>
        <p class="muted-line">Dari {{ number_format($messageSummary['total']) }} total log</p>
    </article>
    <article class="metric-card {{ $messageSummary['failed'] > 0 ? 'is-danger' : 'is-success' }}">
        <p class="metric-label">Rasio Gagal</p>
        <h3 class="metric-value">{{ $messageSummary['failure_rate'] }}%</h3>
        <p class="muted-line">Gagal {{ number_format($messageSummary['failed']) }} | Antrean {{ number_format($messageSummary['queued']) }}</p>
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Konfigurasi Provider</h3>
        <p class="muted-line">Provider aktif menentukan jalur pengiriman WA tenant.</p>
    </div>

    <form method="POST" action="{{ route('tenant.wa.provider-config', ['tenant' => $tenant->id]) }}" class="filters-grid">
        @csrf

        <div>
            <label for="provider_key">Provider</label>
            <select id="provider_key" name="provider_key" required>
                @foreach($providers as $provider)
                    <option value="{{ $provider->key }}">{{ $provider->name }} ({{ $provider->key }})</option>
                @endforeach
            </select>
        </div>

        <div>
            <label for="api_key">API Key / Token</label>
            <input id="api_key" type="text" name="api_key" placeholder="api key mpwa">
        </div>

        <div>
            <label for="sender">Sender / Device</label>
            <input id="sender" type="text" name="sender" placeholder="62812xxxx (sender mpwa)">
        </div>

        <div>
            <label for="base_url">Base URL (opsional)</label>
            <input id="base_url" type="url" name="base_url" placeholder="https://domain-mpwa.example">
        </div>

        <div>
            <label for="send_path">Send Path (opsional)</label>
            <input id="send_path" type="text" name="send_path" placeholder="/send-message">
        </div>

        <div>
            <label class="checkbox-inline">
                <input type="checkbox" name="is_active" value="1" checked> Provider aktif
            </label>
        </div>

        <div class="filter-actions">
            <button class="btn btn-primary" type="submit">Simpan Konfigurasi</button>
        </div>
    </form>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Provider</th>
                <th>Terkonfigurasi</th>
                <th>Aktif</th>
                <th>Diperbarui</th>
            </tr>
            </thead>
            <tbody>
            @foreach($providers as $provider)
                @php $cfg = $configs->get($provider->id); @endphp
                <tr>
                    <td>
                        <p class="row-title">{{ $provider->name }}</p>
                        <p class="row-subtitle">{{ $provider->key }}</p>
                    </td>
                    <td>
                        <span class="status-badge {{ $cfg ? 'status-success' : 'status-neutral' }}">{{ $cfg ? 'ya' : 'tidak' }}</span>
                    </td>
                    <td>
                        <span class="status-badge {{ $cfg && $cfg->is_active ? 'status-success' : 'status-neutral' }}">{{ $cfg && $cfg->is_active ? 'aktif' : 'nonaktif' }}</span>
                    </td>
                    <td>{{ $cfg?->updated_at?->format('d M Y H:i') ?: '-' }}</td>
                </tr>
            @endforeach
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Sumber Template</h3>
        <p class="muted-line">Prioritas resolver: override outlet -> override tenant -> bawaan.</p>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Template</th>
                <th>Sumber</th>
                <th>Versi</th>
            </tr>
            </thead>
            <tbody>
                @foreach($templateRows as $row)
                    <tr>
                        <td><p class="row-title">{{ $row['template_id'] }}</p></td>
                        <td>
                        <span class="status-badge {{ $row['source'] === 'default' ? 'status-neutral' : 'status-info' }}">{{ $templateSourceLabel((string) $row['source']) }}</span>
                        </td>
                        <td>{{ $row['version'] }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Log Pesan</h3>

        <form method="GET" class="form-slim">
            <select name="outlet_id" onchange="this.form.submit()">
                <option value="">Semua Outlet</option>
                @foreach($outlets as $outlet)
                    <option value="{{ $outlet->id }}" @selected($selectedOutletId === $outlet->id)>{{ $outlet->name }}</option>
                @endforeach
            </select>
        </form>
    </div>
    <p class="muted-line">
        Pengiriman sukses terakhir:
        {{ $messageSummary['last_sent_at'] ? \Illuminate\Support\Carbon::parse($messageSummary['last_sent_at'])->format('d M Y H:i') : '-' }}
    </p>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Template</th>
                <th>Tujuan</th>
                <th>Status</th>
                <th>Percobaan</th>
                <th>Galat</th>
                <th>Dibuat</th>
            </tr>
            </thead>
            <tbody>
            @forelse($messages as $message)
                <tr>
                    <td>{{ $message->template_id }}</td>
                    <td>{{ $message->to_phone }}</td>
                    <td><span class="status-badge {{ $messageStatusClass($message->status) }}">{{ $messageStatusLabel($message->status) }}</span></td>
                    <td>{{ $message->attempts }}</td>
                    <td>{{ $message->last_error_code ?: '-' }}</td>
                    <td>{{ $message->created_at?->format('d M Y H:i') }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Belum ada log pesan.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
