@extends('web.layouts.app', ['title' => 'Detail Pesanan'])

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

    $pickup = $orderRow->pickup ?? [];
    $delivery = $orderRow->delivery ?? [];
    $laundryOptions = [
        'received' => 'Diterima',
        'washing' => 'Cuci',
        'drying' => 'Kering',
        'ironing' => 'Setrika',
        'ready' => 'Siap',
        'completed' => 'Selesai',
    ];
    $courierOptions = [
        'pickup_pending' => 'Jemput Tertunda',
        'pickup_on_the_way' => 'Kurir Menuju Jemput',
        'picked_up' => 'Sudah Dijemput',
        'at_outlet' => 'Di Outlet',
        'delivery_pending' => 'Antar Tertunda',
        'delivery_on_the_way' => 'Kurir Menuju Antar',
        'delivered' => 'Terkirim',
    ];
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Detail Operasional</p>
        <h3>Detail Pesanan</h3>
        <p>Pastikan progres laundry, status kurir, item layanan, dan riwayat pembayaran tetap sinkron sebelum pesanan ditutup atau dikirim.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Referensi</p>
            <p class="hero-kpi-value">{{ $orderRow->invoice_no ?: $orderRow->order_code }}</p>
            <p class="hero-kpi-note">Kode internal {{ $orderRow->order_code }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Total</p>
            <p class="hero-kpi-value">Rp{{ number_format($orderRow->total_amount) }}</p>
            <p class="hero-kpi-note">Dibayar Rp{{ number_format($orderRow->paid_amount) }}</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Sisa Tagihan</p>
            <p class="hero-kpi-value">Rp{{ number_format($orderRow->due_amount) }}</p>
            <p class="hero-kpi-note">{{ $orderRow->due_amount > 0 ? 'Belum lunas' : 'Lunas' }}</p>
        </article>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Ringkasan Pesanan</h3>
            <p class="muted-line">
                {{ $orderRow->invoice_no ?: $orderRow->order_code }}
                · Dibuat {{ $orderRow->created_at?->format('d M Y H:i') }}
            </p>
        </div>
        <div class="filter-actions">
            <a href="{{ route('tenant.orders.receipt', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="btn btn-muted" target="_blank" rel="noopener">Cetak Ringkas</a>
            <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}" class="btn btn-ghost">Kembali ke Papan Pesanan</a>
        </div>
    </div>

    <div class="metric-grid">
        <article class="metric-card is-primary">
            <p class="metric-label">Invoice / Kode</p>
            <h3 class="metric-value">{{ $orderRow->invoice_no ?: '-' }}</h3>
            <p class="muted-line">{{ $orderRow->order_code }}</p>
        </article>
        <article class="metric-card is-success">
            <p class="metric-label">Total / Dibayar</p>
            <h3 class="metric-value">Rp{{ number_format($orderRow->total_amount) }}</h3>
            <p class="muted-line">Dibayar Rp{{ number_format($orderRow->paid_amount) }}</p>
        </article>
        <article class="metric-card {{ $orderRow->due_amount > 0 ? 'is-warning' : 'is-success' }}">
            <p class="metric-label">Sisa Tagihan</p>
            <h3 class="metric-value">Rp{{ number_format($orderRow->due_amount) }}</h3>
            <p class="muted-line">{{ $orderRow->due_amount > 0 ? 'Belum lunas' : 'Lunas' }}</p>
        </article>
        <article class="metric-card is-info">
            <p class="metric-label">Jemput & Antar</p>
            <h3 class="metric-value">{{ $orderRow->is_pickup_delivery ? 'Ya' : 'Tidak' }}</h3>
            <p class="muted-line">Kurir {{ $orderRow->courier?->name ?: '-' }}</p>
        </article>
    </div>
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <h3>Pelanggan & Outlet</h3>
        </div>
        <div class="detail-pairs">
            <div>
                <p class="muted-line">Pelanggan</p>
                <p class="row-title">{{ $orderRow->customer?->name ?: '-' }}</p>
                <p class="row-subtitle">{{ $orderRow->customer?->phone_normalized ?: '-' }}</p>
            </div>
            <div>
                <p class="muted-line">Outlet</p>
                <p class="row-title">{{ $orderRow->outlet?->name ?: '-' }}</p>
                <p class="row-subtitle">{{ $orderRow->outlet?->code ?: '-' }} · {{ $orderRow->outlet?->timezone ?: '-' }}</p>
            </div>
            <div>
                <p class="muted-line">Status Laundry</p>
                <span class="status-badge {{ $statusClass($orderRow->laundry_status) }}">{{ $statusLabel($orderRow->laundry_status) }}</span>
            </div>
            <div>
                <p class="muted-line">Status Kurir</p>
                @if($orderRow->courier_status)
                    <span class="status-badge {{ $statusClass($orderRow->courier_status) }}">{{ $statusLabel($orderRow->courier_status) }}</span>
                @else
                    <span class="status-badge status-neutral">-</span>
                @endif
            </div>
        </div>
    </article>

    <article class="panel-section">
        <div class="section-head">
            <h3>Informasi Jemput & Antar</h3>
        </div>
        <div class="detail-pairs">
            <div>
                <p class="muted-line">Alamat Jemput</p>
                <p class="row-title">{{ data_get($pickup, 'address_short') ?: data_get($pickup, 'address') ?: '-' }}</p>
                <p class="row-subtitle">{{ data_get($pickup, 'slot') ?: data_get($pickup, 'schedule_slot') ?: data_get($pickup, 'date') ?: '-' }}</p>
            </div>
            <div>
                <p class="muted-line">Alamat Antar</p>
                <p class="row-title">{{ data_get($delivery, 'address_short') ?: data_get($delivery, 'address') ?: '-' }}</p>
                <p class="row-subtitle">{{ data_get($delivery, 'slot') ?: data_get($delivery, 'schedule_slot') ?: data_get($delivery, 'date') ?: '-' }}</p>
            </div>
            <div>
                <p class="muted-line">Biaya Pengantaran</p>
                <p class="row-title">Rp{{ number_format($orderRow->shipping_fee_amount) }}</p>
            </div>
            <div>
                <p class="muted-line">Diskon</p>
                <p class="row-title">Rp{{ number_format($orderRow->discount_amount) }}</p>
            </div>
        </div>
        @if($orderRow->notes)
            <p class="muted-line">Catatan</p>
            <p class="row-title">{{ $orderRow->notes }}</p>
        @endif
    </article>
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <h3>Linimasa Laundry</h3>
        </div>
        <div class="timeline-stack">
            @foreach($laundryTimeline as $step)
                <div class="timeline-item is-{{ $step['state'] }}">
                    <span class="timeline-dot"></span>
                    <div>
                        <p class="row-title">{{ $step['label'] }}</p>
                        @if($step['key'] === $orderRow->laundry_status)
                            <p class="row-subtitle">Status saat ini</p>
                        @endif
                    </div>
                </div>
            @endforeach
        </div>
    </article>

    <article class="panel-section">
        <div class="section-head">
            <h3>Linimasa Kurir</h3>
        </div>
        @if(! $orderRow->is_pickup_delivery)
            <p class="muted-line">Pesanan ini tidak menggunakan pipeline jemput/antar.</p>
        @else
            <div class="timeline-stack">
                @foreach($courierTimeline as $step)
                    <div class="timeline-item is-{{ $step['state'] }}">
                        <span class="timeline-dot"></span>
                        <div>
                            <p class="row-title">{{ $step['label'] }}</p>
                            @if($step['key'] === $orderRow->courier_status)
                                <p class="row-subtitle">Status saat ini</p>
                            @endif
                        </div>
                    </div>
                @endforeach
            </div>
        @endif
    </article>
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <div>
                <h3>Aksi Status Laundry</h3>
                <p class="muted-line">Status saat ini: <strong>{{ $statusLabel($orderRow->laundry_status) }}</strong></p>
            </div>
        </div>
        <form method="POST" action="{{ route('tenant.orders.status.laundry', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid">
            @csrf
            <div>
                <label for="laundry_status_target">Target Status Laundry</label>
                <select id="laundry_status_target" name="laundry_status" required>
                    @php($selectedLaundryStatus = old('laundry_status', $orderRow->laundry_status))
                    @foreach($laundryOptions as $value => $label)
                        @php($isLaundryAllowed = in_array((string) $value, $allowedLaundryStatuses, true))
                        <option
                            value="{{ $value }}"
                            @selected((string) $selectedLaundryStatus === (string) $value)
                            @disabled(! $isLaundryAllowed)
                        >
                            {{ $label }}{{ $isLaundryAllowed ? '' : ' (tidak valid saat ini)' }}
                        </option>
                    @endforeach
                </select>
                <p class="muted-line">Transisi wajib maju sesuai pipeline.</p>
                @error('laundry_status')
                    <p class="muted-line" style="color: #b42318;">{{ $message }}</p>
                @enderror
            </div>
            <div class="filter-actions" style="grid-column: 1 / -1;">
                <button type="submit" class="btn btn-primary">Perbarui Status Laundry</button>
            </div>
        </form>
    </article>

    <article class="panel-section">
        <div class="section-head">
            <div>
                <h3>Aksi Kurir</h3>
                <p class="muted-line">Status kurir saat ini: <strong>{{ $statusLabel($orderRow->courier_status) }}</strong></p>
            </div>
        </div>

        @if(! $orderRow->is_pickup_delivery)
            <p class="muted-line">Order non pickup-delivery, aksi status/assignment kurir tidak tersedia.</p>
        @else
            <form method="POST" action="{{ route('tenant.orders.status.courier', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid">
                @csrf
                <div>
                    <label for="courier_status_target">Target Status Kurir</label>
                    <select id="courier_status_target" name="courier_status" required>
                        @php($selectedCourierStatus = old('courier_status', $orderRow->courier_status ?: 'pickup_pending'))
                        @foreach($courierOptions as $value => $label)
                            @php($isCourierAllowed = in_array((string) $value, $allowedCourierStatuses, true))
                            <option
                                value="{{ $value }}"
                                @selected((string) $selectedCourierStatus === (string) $value)
                                @disabled(! $isCourierAllowed)
                            >
                                {{ $label }}{{ $isCourierAllowed ? '' : ' (tidak valid saat ini)' }}
                            </option>
                        @endforeach
                    </select>
                    <p class="muted-line">Jika target delivery_pending, laundry harus ready/completed.</p>
                    @error('courier_status')
                        <p class="muted-line" style="color: #b42318;">{{ $message }}</p>
                    @enderror
                </div>
                <div class="filter-actions" style="grid-column: 1 / -1;">
                    <button type="submit" class="btn btn-primary">Perbarui Status Kurir</button>
                </div>
            </form>

            <form method="POST" action="{{ route('tenant.orders.assign-courier', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid" style="margin-top: 10px;">
                @csrf
                <div>
                    <label for="courier_user_id">Tugaskan Kurir</label>
                    <select id="courier_user_id" name="courier_user_id" required>
                        <option value="">Pilih kurir aktif</option>
                        @php($selectedCourierUserId = old('courier_user_id', (string) ($orderRow->courier_user_id ?? '')))
                        @foreach($couriers as $courierOption)
                            <option value="{{ $courierOption->id }}" @selected((string) $selectedCourierUserId === (string) $courierOption->id)>{{ $courierOption->name }}</option>
                        @endforeach
                    </select>
                    <p class="muted-line">Kurir saat ini: {{ $orderRow->courier?->name ?: '-' }}</p>
                    @error('courier_user_id')
                        <p class="muted-line" style="color: #b42318;">{{ $message }}</p>
                    @enderror
                </div>
                <div class="filter-actions" style="grid-column: 1 / -1;">
                    <button type="submit" class="btn btn-primary">Simpan Assignment Kurir</button>
                </div>
            </form>
        @endif
    </article>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Item Pesanan</h3>
        <p class="muted-line">{{ number_format($orderRow->items->count()) }} item</p>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Layanan</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Berat</th>
                <th>Harga Unit</th>
                <th>Subtotal</th>
            </tr>
            </thead>
            <tbody>
            @forelse($orderRow->items as $item)
                <tr>
                    <td><p class="row-title">{{ $item->service_name_snapshot }}</p></td>
                    <td>{{ $item->unit_type_snapshot }}</td>
                    <td>{{ is_null($item->qty) ? '-' : number_format((float) $item->qty, 2) }}</td>
                    <td>{{ is_null($item->weight_kg) ? '-' : number_format((float) $item->weight_kg, 2) }} kg</td>
                    <td>Rp{{ number_format($item->unit_price_amount) }}</td>
                    <td><p class="row-title">Rp{{ number_format($item->subtotal_amount) }}</p></td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Belum ada item order.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Riwayat Pembayaran</h3>
        <p class="muted-line">{{ number_format($orderRow->payments->count()) }} pembayaran</p>
    </div>

    <div class="panel-section" style="margin-top: 0;">
        <div class="section-head">
            <div>
                <h3>Tambah Pembayaran</h3>
                <p class="muted-line">Histori pembayaran bersifat append-only dan tidak dapat diubah.</p>
            </div>
            <span class="status-badge {{ $orderRow->due_amount > 0 ? 'status-warning' : 'status-success' }}">
                {{ $orderRow->due_amount > 0 ? 'Belum Lunas' : 'Lunas' }}
            </span>
        </div>
        <form method="POST" action="{{ route('tenant.orders.payments.store', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid">
            @csrf
            <div>
                <label for="payment_amount">Jumlah Pembayaran</label>
                <input id="payment_amount" type="number" min="1" step="1" name="amount" value="{{ old('amount') }}">
                <p class="muted-line">Sisa saat ini Rp{{ number_format($orderRow->due_amount) }}</p>
            </div>
            <div>
                <label for="payment_method">Metode</label>
                <select id="payment_method" name="method" required>
                    @php($paymentMethod = old('method', 'cash'))
                    <option value="cash" @selected($paymentMethod === 'cash')>Tunai</option>
                    <option value="transfer" @selected($paymentMethod === 'transfer')>Transfer Bank</option>
                    <option value="qris" @selected($paymentMethod === 'qris')>QRIS</option>
                    <option value="ewallet" @selected($paymentMethod === 'ewallet')>Dompet Digital</option>
                </select>
            </div>
            <div>
                <label for="payment_paid_at">Waktu Bayar (opsional)</label>
                <input id="payment_paid_at" type="datetime-local" name="paid_at" value="{{ old('paid_at') }}">
            </div>
            <div>
                <label for="payment_notes">Catatan (opsional)</label>
                <input id="payment_notes" type="text" name="notes" value="{{ old('notes') }}" maxlength="255" placeholder="contoh: DP tahap 1">
            </div>
            <div class="filter-actions" style="grid-column: 1 / -1;">
                <button type="submit" class="btn btn-muted" name="quick_action" value="full" @disabled($orderRow->due_amount <= 0)>Bayar Lunas</button>
                <button type="submit" class="btn btn-muted" name="quick_action" value="half" @disabled($orderRow->due_amount <= 0)>Bayar 50%</button>
                <button type="submit" class="btn btn-muted" name="quick_action" value="fixed_10000" @disabled($orderRow->due_amount <= 0)>Bayar Rp10.000</button>
                <button type="submit" class="btn btn-primary">Simpan Pembayaran</button>
            </div>
        </form>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Waktu Bayar</th>
                <th>Metode</th>
                <th>Jumlah</th>
                <th>Catatan</th>
            </tr>
            </thead>
            <tbody>
            @forelse($orderRow->payments as $payment)
                <tr>
                    <td>{{ $payment->paid_at?->format('d M Y H:i') }}</td>
                    <td><span class="chip">{{ $payment->method }}</span></td>
                    <td><p class="row-title">Rp{{ number_format($payment->amount) }}</p></td>
                    <td>{{ $payment->notes ?: '-' }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="4">Belum ada pembayaran.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
</div>
@endsection
