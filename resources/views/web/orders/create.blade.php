@extends('web.layouts.app', ['title' => 'Buat Transaksi'])

@php
    $quotaRemaining = is_null($quota['orders_remaining'] ?? null)
        ? 'Tak terbatas'
        : number_format((int) $quota['orders_remaining']);
@endphp

@section('content')
<div class="page-shell">
<section class="page-hero">
    <div class="page-hero-main">
        <p class="panel-kicker">Transaksi Web</p>
        <h3>Buat Transaksi Baru</h3>
        <p>Masukkan data pelanggan, layanan, serta komponen biaya untuk membuat order baru langsung dari panel web kasir/admin.</p>
    </div>
    <div class="page-hero-meta">
        <article class="hero-kpi">
            <p class="hero-kpi-label">Outlet Cakupan</p>
            <p class="hero-kpi-value">{{ number_format($outlets->count()) }}</p>
            <p class="hero-kpi-note">Sesuai hak akses akun</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Layanan Aktif</p>
            <p class="hero-kpi-value">{{ number_format($services->count()) }}</p>
            <p class="hero-kpi-note">Katalog siap transaksi</p>
        </article>
        <article class="hero-kpi">
            <p class="hero-kpi-label">Sisa Kuota</p>
            <p class="hero-kpi-value">{{ $quotaRemaining }}</p>
            <p class="hero-kpi-note">Periode {{ $quota['period'] ?? '-' }}</p>
        </article>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Form Transaksi</h3>
            <p class="muted-line">Lengkapi data berikut. Hitungan final akan divalidasi ulang di server.</p>
        </div>
        <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}" class="btn btn-ghost">Kembali ke Papan Pesanan</a>
    </div>

    <form
        method="POST"
        action="{{ route('tenant.orders.store', ['tenant' => $tenant->id]) }}"
        class="page-shell"
        x-data="webOrderFormBuilder({
            services: @js($services->map(fn ($service) => [
                'id' => (string) $service->id,
                'name' => (string) $service->name,
                'unit_type' => (string) $service->unit_type,
                'base_price_amount' => (int) $service->base_price_amount,
            ])->values()->all()),
            priceMap: @js($outletServicePriceMap),
            initial: @js([
                'outlet_id' => (string) old('outlet_id', ''),
                'shipping_fee_amount' => (string) old('shipping_fee_amount', 0),
                'discount_amount' => (string) old('discount_amount', 0),
                'items' => collect(old('items', [['service_id' => '', 'qty' => '', 'weight_kg' => '']]))
                    ->values()
                    ->map(fn ($item) => [
                        'service_id' => (string) ($item['service_id'] ?? ''),
                        'qty' => (string) ($item['qty'] ?? ''),
                        'weight_kg' => (string) ($item['weight_kg'] ?? ''),
                    ])
                    ->all(),
            ]),
        })"
    >
        @csrf

        <div class="filters-grid">
            <div>
                <label for="outlet_id">Outlet</label>
                <select id="outlet_id" name="outlet_id" x-model="outletId" required>
                    <option value="">Pilih outlet</option>
                    @foreach($outlets as $outlet)
                        <option value="{{ $outlet->id }}">
                            {{ $outlet->name }} ({{ $outlet->code }})
                        </option>
                    @endforeach
                </select>
            </div>

            <div>
                <label for="order_code">Kode Order (opsional)</label>
                <input id="order_code" type="text" name="order_code" value="{{ old('order_code') }}" maxlength="32" placeholder="auto jika kosong">
            </div>

            <div>
                <label for="invoice_no">Invoice (opsional)</label>
                <input id="invoice_no" type="text" name="invoice_no" value="{{ old('invoice_no') }}" maxlength="50" placeholder="opsional">
            </div>

            <div>
                <label for="shipping_fee_amount">Biaya Antar/Jemput</label>
                <input id="shipping_fee_amount" type="number" min="0" name="shipping_fee_amount" x-model="shippingFee">
            </div>

            <div>
                <label for="discount_amount">Diskon</label>
                <input id="discount_amount" type="number" min="0" name="discount_amount" x-model="discount">
            </div>

            <div>
                <label class="checkbox-inline" for="is_pickup_delivery">
                    <input id="is_pickup_delivery" type="checkbox" name="is_pickup_delivery" value="1" @checked((string) old('is_pickup_delivery') === '1')>
                    Transaksi pickup-delivery
                </label>
            </div>
        </div>

        <div class="dashboard-grid-2">
            <article class="panel-section" x-data="customerQuickLookup(@js($customerSeeds->map(fn ($row) => [
                'id' => $row->id,
                'name' => (string) $row->name,
                'phone' => (string) $row->phone_normalized,
                'notes' => (string) ($row->notes ?? ''),
            ])->values()->all()))">
                <div class="section-head">
                    <div>
                        <h3>Data Pelanggan</h3>
                        <p class="muted-line">Cari pelanggan existing, atau isi manual untuk pelanggan baru.</p>
                    </div>
                </div>
                <div class="filters-grid">
                    <div style="grid-column: 1 / -1;">
                        <label for="customer_lookup">Cari Pelanggan Cepat</label>
                        <div class="lookup-shell" @click.outside="open = false">
                            <input
                                id="customer_lookup"
                                type="text"
                                x-model="query"
                                @focus="open = true"
                                @input="open = true"
                                placeholder="nama atau nomor telepon pelanggan"
                            >
                            <div class="lookup-panel" x-cloak x-show="open">
                                <template x-for="item in filteredCustomers" :key="item.id">
                                    <button type="button" class="lookup-item" @click="choose(item)">
                                        <span class="lookup-item-main" x-text="item.name"></span>
                                        <span class="lookup-item-sub" x-text="item.phone"></span>
                                    </button>
                                </template>
                                <p class="muted-line" x-show="filteredCustomers.length === 0">Tidak ada pelanggan cocok. Lanjut isi manual di bawah.</p>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label for="customer_name">Nama Pelanggan</label>
                        <input id="customer_name" x-ref="name" type="text" name="customer[name]" value="{{ old('customer.name') }}" maxlength="150" required>
                    </div>
                    <div>
                        <label for="customer_phone">Nomor Telepon</label>
                        <input id="customer_phone" x-ref="phone" type="text" name="customer[phone]" value="{{ old('customer.phone') }}" maxlength="30" required>
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label for="customer_notes">Catatan Pelanggan</label>
                        <textarea id="customer_notes" x-ref="notes" name="customer[notes]" rows="2" placeholder="opsional">{{ old('customer.notes') }}</textarea>
                        <p class="muted-line">Jika nomor telepon sudah ada, data pelanggan akan di-upsert otomatis saat simpan transaksi.</p>
                    </div>
                </div>
            </article>

            <article class="panel-section">
                <div class="section-head">
                    <h3>Jadwal Pickup/Delivery</h3>
                </div>
                <div class="filters-grid">
                    <div>
                        <label for="pickup_address">Alamat Jemput</label>
                        <input id="pickup_address" type="text" name="pickup_address" value="{{ old('pickup_address') }}" maxlength="255" placeholder="opsional">
                    </div>
                    <div>
                        <label for="pickup_slot">Slot Jemput</label>
                        <input id="pickup_slot" type="text" name="pickup_slot" value="{{ old('pickup_slot') }}" maxlength="80" placeholder="contoh: 09:00-11:00">
                    </div>
                    <div>
                        <label for="delivery_address">Alamat Antar</label>
                        <input id="delivery_address" type="text" name="delivery_address" value="{{ old('delivery_address') }}" maxlength="255" placeholder="opsional">
                    </div>
                    <div>
                        <label for="delivery_slot">Slot Antar</label>
                        <input id="delivery_slot" type="text" name="delivery_slot" value="{{ old('delivery_slot') }}" maxlength="80" placeholder="contoh: 16:00-18:00">
                    </div>
                </div>
            </article>
        </div>

        <article class="panel-section">
            <div class="section-head">
                <div>
                    <h3>Item Layanan</h3>
                    <p class="muted-line">Tambahkan beberapa item layanan dalam satu transaksi.</p>
                </div>
            </div>

            <div class="table-wrap">
                <table>
                    <thead>
                    <tr>
                        <th>Layanan</th>
                        <th>Harga Unit</th>
                        <th>Qty (pcs)</th>
                        <th>Berat (kg)</th>
                        <th>Subtotal</th>
                        <th>Aksi</th>
                    </tr>
                    </thead>
                    <tbody>
                    <template x-for="(row, index) in rows" :key="index">
                        <tr>
                            <td>
                                <select :name="`items[${index}][service_id]`" x-model="row.service_id" @change="onServiceChanged(row)" required>
                                    <option value="">Pilih layanan</option>
                                    @foreach($services as $service)
                                        <option value="{{ $service->id }}">
                                            {{ $service->name }} ({{ $service->unit_type }}) - Rp{{ number_format($service->base_price_amount) }}
                                        </option>
                                    @endforeach
                                </select>
                            </td>
                            <td>
                                <p class="row-title">Rp<span x-text="formatCurrency(priceFor(row.service_id))"></span></p>
                                <span class="status-badge status-info" x-show="hasOverride(row.service_id)">override outlet</span>
                                <p class="row-subtitle" x-text="rowHint(row)"></p>
                            </td>
                            <td>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    :name="`items[${index}][qty]`"
                                    x-model="row.qty"
                                    :disabled="unitOf(row.service_id) !== 'pcs'"
                                    placeholder="untuk pcs"
                                >
                            </td>
                            <td>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.01"
                                    :name="`items[${index}][weight_kg]`"
                                    x-model="row.weight_kg"
                                    :disabled="unitOf(row.service_id) !== 'kg'"
                                    placeholder="untuk kg"
                                >
                            </td>
                            <td>
                                <p class="row-title">Rp<span x-text="formatCurrency(lineSubtotal(row))"></span></p>
                            </td>
                            <td>
                                <button type="button" class="btn btn-danger btn-sm" @click="removeRow(index)" :disabled="rows.length === 1">Hapus</button>
                            </td>
                        </tr>
                    </template>
                    </tbody>
                </table>
            </div>

            <div class="order-builder-foot">
                <button type="button" class="btn btn-muted" @click="addRow()">Tambah Item</button>

                <div class="order-estimate">
                    <p class="muted-line">Estimasi Subtotal: <strong>Rp<span x-text="formatCurrency(estimatedSubtotal)"></span></strong></p>
                    <p class="muted-line">Estimasi Total: <strong>Rp<span x-text="formatCurrency(estimatedTotal)"></span></strong></p>
                    <p class="muted-line">Total final mengikuti validasi server saat submit.</p>
                </div>
            </div>
        </article>

        <article class="panel-section">
            <label for="notes">Catatan Transaksi</label>
            <textarea id="notes" name="notes" rows="3" placeholder="opsional catatan order">{{ old('notes') }}</textarea>
            <div class="filter-actions" style="margin-top: 10px;">
                <button type="submit" class="btn btn-primary">Simpan Transaksi</button>
                <a href="{{ route('tenant.orders.index', ['tenant' => $tenant->id]) }}" class="btn btn-ghost">Batal</a>
            </div>
        </article>
    </form>
</section>
</div>
@endsection
