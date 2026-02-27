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
    $invoiceLabel = $orderRow->invoice_no ?: $orderRow->order_code;
    $paymentStatusClass = $orderRow->due_amount > 0 ? 'status-warning' : 'status-success';
    $paymentStatusLabel = $orderRow->due_amount > 0 ? 'Belum Lunas' : 'Lunas';
    $lastPayment = $orderRow->payments->first();
    $totalQty = (float) $orderRow->items->sum(fn ($item) => (float) ($item->qty ?? 0));
    $totalWeight = (float) $orderRow->items->sum(fn ($item) => (float) ($item->weight_kg ?? 0));
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Detail Operasional</p>
        <h3>{{ $invoiceLabel }}</h3>
        <p>{{ $orderRow->customer?->name ?: '-' }} · {{ $orderRow->outlet?->name ?: '-' }}</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Pembayaran</p>
            <p class="hero-kpi-value">Rp{{ number_format($orderRow->paid_amount) }} / Rp{{ number_format($orderRow->total_amount) }}</p>
            <p class="hero-kpi-note">Sisa Rp{{ number_format($orderRow->due_amount) }} · {{ $paymentStatusLabel }}</p>
        </article>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Ringkasan</h3>
            <p class="muted-line">Informasi inti order dan status saat ini.</p>
        </div>
        <div class="filter-actions">
            <a href="{{ route('tenant.orders.receipt', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="btn btn-muted" target="_blank" rel="noopener">Cetak Ringkas</a>
            <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}" class="btn btn-ghost">Kembali</a>
        </div>
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
            <span class="status-badge {{ $orderRow->courier_status ? $statusClass($orderRow->courier_status) : 'status-neutral' }}">
                {{ $orderRow->courier_status ? $statusLabel($orderRow->courier_status) : '-' }}
            </span>
        </div>
        <div>
            <p class="muted-line">Dibuat</p>
            <p class="row-title">{{ $orderRow->created_at?->format('d M Y H:i') ?: '-' }}</p>
            <p class="row-subtitle">Update {{ $orderRow->updated_at?->format('d M Y H:i') ?: '-' }}</p>
        </div>
        <div>
            <p class="muted-line">Pembayaran</p>
            <span class="status-badge {{ $paymentStatusClass }}">{{ $paymentStatusLabel }}</span>
            <p class="row-subtitle">
                @if($lastPayment?->paid_at)
                    Terakhir {{ $lastPayment->paid_at->format('d M Y H:i') }}
                @else
                    Belum ada pembayaran
                @endif
            </p>
        </div>
    </div>

    @if($orderRow->notes)
        <p class="muted-line" style="margin-top: 12px;">Catatan</p>
        <p class="row-title">{{ $orderRow->notes }}</p>
    @endif
</section>

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <div>
                <h3>Jemput & Antar</h3>
                <p class="muted-line">Alamat dan jadwal bila order memakai pickup-delivery.</p>
            </div>
        </div>

        <div class="detail-pairs">
            <div>
                <p class="muted-line">Tipe Layanan</p>
                <p class="row-title">{{ $orderRow->is_pickup_delivery ? 'Pickup & Delivery' : 'Drop Off Outlet' }}</p>
                <p class="row-subtitle">Kurir {{ $orderRow->courier?->name ?: '-' }}</p>
            </div>
            <div>
                <p class="muted-line">Diskon</p>
                <p class="row-title">Rp{{ number_format($orderRow->discount_amount) }}</p>
                <p class="row-subtitle">Total qty {{ number_format($totalQty, 2) }} · {{ number_format($totalWeight, 2) }} kg</p>
            </div>
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
        </div>
    </article>

    <article class="panel-section">
        <div class="section-head">
            <div>
                <h3>Aksi Status</h3>
                <p class="muted-line">Cukup ubah status yang memang dibutuhkan.</p>
            </div>
        </div>

        <form method="POST" action="{{ route('tenant.orders.status.laundry', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid">
            @csrf
            <div>
                <label for="laundry_status_target">Status Laundry</label>
                <select id="laundry_status_target" name="laundry_status" required>
                    @php($selectedLaundryStatus = old('laundry_status', $orderRow->laundry_status))
                    @foreach($laundryOptions as $value => $label)
                        @php($isLaundryAllowed = in_array((string) $value, $allowedLaundryStatuses, true))
                        <option value="{{ $value }}" @selected((string) $selectedLaundryStatus === (string) $value) @disabled(! $isLaundryAllowed)>
                            {{ $label }}{{ $isLaundryAllowed ? '' : ' (tidak valid)' }}
                        </option>
                    @endforeach
                </select>
                @error('laundry_status')
                    <p class="muted-line" style="color: #b42318;">{{ $message }}</p>
                @enderror
            </div>
            <div class="filter-actions" style="grid-column: 1 / -1;">
                <button type="submit" class="btn btn-primary">Simpan Status Laundry</button>
            </div>
        </form>

        @if(! $orderRow->is_pickup_delivery)
            <p class="muted-line" style="margin-top: 12px;">Order ini tidak memakai pickup-delivery.</p>
        @else
            <form method="POST" action="{{ route('tenant.orders.status.courier', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid" style="margin-top: 12px;">
                @csrf
                <div>
                    <label for="courier_status_target">Status Kurir</label>
                    <select id="courier_status_target" name="courier_status" required>
                        @php($selectedCourierStatus = old('courier_status', $orderRow->courier_status ?: 'pickup_pending'))
                        @foreach($courierOptions as $value => $label)
                            @php($isCourierAllowed = in_array((string) $value, $allowedCourierStatuses, true))
                            <option value="{{ $value }}" @selected((string) $selectedCourierStatus === (string) $value) @disabled(! $isCourierAllowed)>
                                {{ $label }}{{ $isCourierAllowed ? '' : ' (tidak valid)' }}
                            </option>
                        @endforeach
                    </select>
                    @error('courier_status')
                        <p class="muted-line" style="color: #b42318;">{{ $message }}</p>
                    @enderror
                </div>
                <div class="filter-actions" style="grid-column: 1 / -1;">
                    <button type="submit" class="btn btn-primary">Simpan Status Kurir</button>
                </div>
            </form>

            <form method="POST" action="{{ route('tenant.orders.assign-courier', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="filters-grid" style="margin-top: 12px;">
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
                    @error('courier_user_id')
                        <p class="muted-line" style="color: #b42318;">{{ $message }}</p>
                    @enderror
                </div>
                <div class="filter-actions" style="grid-column: 1 / -1;">
                    <button type="submit" class="btn btn-primary">Simpan Kurir</button>
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

<section class="dashboard-grid-2">
    <article class="panel-section">
        <div class="section-head">
            <div>
                <h3>Tambah Pembayaran</h3>
                <p class="muted-line">Catat pembayaran baru bila masih ada sisa tagihan.</p>
            </div>
            <span class="status-badge {{ $paymentStatusClass }}">{{ $paymentStatusLabel }}</span>
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
                <label for="payment_paid_at">Waktu Bayar</label>
                <input id="payment_paid_at" type="datetime-local" name="paid_at" value="{{ old('paid_at') }}">
            </div>
            <div>
                <label for="payment_notes">Catatan</label>
                <input id="payment_notes" type="text" name="notes" value="{{ old('notes') }}" maxlength="255" placeholder="opsional">
            </div>
            <div class="filter-actions" style="grid-column: 1 / -1;">
                <button type="submit" class="btn btn-muted" name="quick_action" value="full" @disabled($orderRow->due_amount <= 0)>Bayar Lunas</button>
                <button type="submit" class="btn btn-primary" @disabled($orderRow->due_amount <= 0)>Simpan Pembayaran</button>
            </div>
        </form>
    </article>

    <article class="panel-section">
        <div class="section-head">
            <h3>Riwayat Pembayaran</h3>
            <p class="muted-line">{{ number_format($orderRow->payments->count()) }} pembayaran</p>
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
                        <td>{{ $payment->paid_at?->format('d M Y H:i') ?: '-' }}</td>
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
    </article>
</section>
</div>
@endsection
