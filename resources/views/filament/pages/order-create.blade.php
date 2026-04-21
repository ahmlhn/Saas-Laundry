<x-filament-panels::page>
    @php
        $quotaRemaining = is_null($quota['orders_remaining'] ?? null) ? 'Tak terbatas' : number_format((int) ($quota['orders_remaining'] ?? 0), 0, ',', '.');
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
    @endphp

    <div class="space-y-6">
        @if ($errors->any())
            <div class="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-200">
                <ul class="space-y-1">
                    @foreach ($errors->all() as $error)
                        <li>{{ $error }}</li>
                    @endforeach
                </ul>
            </div>
        @endif

        <section class="{{ $card }}">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Order Baru</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Buat transaksi dari panel Filament</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Flow server tetap sama. Halaman ini memindahkan entry point create order ke panel baru.</p>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="rounded-xl bg-primary-50 p-4 dark:bg-primary-500/10"><p class="text-xs text-primary-700 dark:text-primary-200">Outlet</p><p class="mt-2 text-lg font-semibold text-primary-950 dark:text-white">{{ number_format(count($outlets), 0, ',', '.') }}</p></div>
                    <div class="rounded-xl bg-gray-100 p-4 dark:bg-white/5"><p class="text-xs text-gray-600 dark:text-gray-300">Layanan aktif</p><p class="mt-2 text-lg font-semibold text-gray-950 dark:text-white">{{ number_format(count($services), 0, ',', '.') }}</p></div>
                    <div class="rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10"><p class="text-xs text-amber-700 dark:text-amber-200">Sisa kuota</p><p class="mt-2 text-lg font-semibold text-amber-950 dark:text-white">{{ $quotaRemaining }}</p></div>
                </div>
            </div>
        </section>

        <form
            method="POST"
            action="{{ route('tenant.orders.store') }}"
            class="space-y-6"
            x-data="orderCreatePage({
                services: @js($services),
                priceMap: @js($outletServicePriceMap),
                customerSeeds: @js($customerSeeds),
                initial: @js([
                    'outlet_id' => (string) old('outlet_id', ''),
                    'requires_pickup' => (string) old('requires_pickup', '0'),
                    'requires_delivery' => (string) old('requires_delivery', '0'),
                    'shipping_fee_amount' => (string) old('shipping_fee_amount', 0),
                    'discount_amount' => (string) old('discount_amount', 0),
                    'customer_lookup' => '',
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

            <section class="{{ $card }}">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <input type="hidden" name="is_pickup_delivery" :value="(requiresPickup || requiresDelivery) ? '1' : '0'">
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Outlet</span>
                        <select name="outlet_id" x-model="outletId" required class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                            <option value="">Pilih outlet</option>
                            @foreach ($outlets as $outlet)
                                <option value="{{ $outlet['id'] }}">{{ $outlet['name'] }}{{ $outlet['code'] ? " ({$outlet['code']})" : '' }}</option>
                            @endforeach
                        </select>
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Kode order</span>
                        <input type="text" name="order_code" value="{{ old('order_code') }}" maxlength="32" placeholder="auto jika kosong" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Invoice</span>
                        <input type="text" name="invoice_no" value="{{ old('invoice_no') }}" maxlength="50" placeholder="opsional" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Diskon</span>
                        <input type="number" min="0" name="discount_amount" x-model="discount" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200" x-show="requiresPickup || requiresDelivery" x-cloak>
                        <span>Biaya antar/jemput</span>
                        <input type="number" min="0" name="shipping_fee_amount" x-model="shippingFee" :disabled="!requiresPickup && !requiresDelivery" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200" x-show="requiresPickup || requiresDelivery" x-cloak>
                        <span>Kurir</span>
                        <select name="courier_user_id" :disabled="!requiresPickup && !requiresDelivery" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                            <option value="">Nanti saja / belum ada kurir khusus</option>
                            @foreach ($couriers as $courier)
                                <option value="{{ $courier['id'] }}" @selected((string) old('courier_user_id') === (string) $courier['id'])>{{ $courier['name'] }}</option>
                            @endforeach
                        </select>
                    </label>
                </div>

                <div class="mt-4 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-300">
                    <label class="inline-flex items-center gap-2">
                        <input type="checkbox" name="requires_pickup" value="1" x-model="requiresPickup" class="rounded border-gray-300 text-primary-600">
                        <span>Jemput</span>
                    </label>
                    <label class="inline-flex items-center gap-2">
                        <input type="checkbox" name="requires_delivery" value="1" x-model="requiresDelivery" class="rounded border-gray-300 text-primary-600">
                        <span>Antar</span>
                    </label>
                </div>
            </section>

            <section class="grid gap-6 xl:grid-cols-2">
                <article class="{{ $card }}">
                    <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Pelanggan</h3>
                    <div class="mt-4 grid gap-4">
                        <div class="relative" @click.outside="lookupOpen = false">
                            <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Cari cepat</label>
                            <input type="text" x-model="lookupQuery" @focus="lookupOpen = true" @input="lookupOpen = true" placeholder="nama atau nomor telepon" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                            <div x-cloak x-show="lookupOpen" class="absolute z-10 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-gray-900">
                                <template x-for="item in filteredCustomers" :key="item.id">
                                    <button type="button" class="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/5" @click="chooseCustomer(item)">
                                        <span class="text-sm font-medium text-gray-950 dark:text-white" x-text="item.name"></span>
                                        <span class="text-xs text-gray-500 dark:text-gray-400" x-text="item.phone"></span>
                                    </button>
                                </template>
                                <p x-show="filteredCustomers.length === 0" class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Tidak ada pelanggan cocok.</p>
                            </div>
                        </div>
                        <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <span>Nama pelanggan</span>
                            <input x-ref="customerName" type="text" name="customer[name]" value="{{ old('customer.name') }}" maxlength="150" required class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        </label>
                        <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <span>Telepon</span>
                            <input x-ref="customerPhone" type="text" name="customer[phone]" value="{{ old('customer.phone') }}" maxlength="30" required class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        </label>
                        <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <span>Catatan pelanggan</span>
                            <textarea x-ref="customerNotes" name="customer[notes]" rows="3" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">{{ old('customer.notes') }}</textarea>
                        </label>
                    </div>
                </article>

                <article class="{{ $card }}">
                    <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Pickup & Delivery</h3>
                    <div class="mt-4 grid gap-4">
                        <label x-show="requiresPickup" x-cloak class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <span>Alamat jemput</span>
                            <input type="text" name="pickup_address" value="{{ old('pickup_address') }}" maxlength="255" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        </label>
                        <label x-show="requiresPickup" x-cloak class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <span>Slot jemput</span>
                            <input type="text" name="pickup_slot" value="{{ old('pickup_slot', now()->format('Y-m-d')) }}" maxlength="80" :required="requiresPickup" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        </label>
                        <label x-show="requiresDelivery" x-cloak class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                            <span>Alamat antar</span>
                            <input type="text" name="delivery_address" value="{{ old('delivery_address') }}" maxlength="255" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        </label>
                        <div x-show="requiresDelivery" x-cloak class="space-y-2">
                            <span class="block text-sm font-medium text-gray-700 dark:text-gray-200">Slot antar</span>
                            <input type="text" value="Otomatis oleh sistem" readonly disabled class="w-full rounded-xl border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                            <p class="text-sm text-gray-500 dark:text-gray-400">Jadwal antar dihitung otomatis dari durasi layanan terlama.</p>
                        </div>
                        <p x-show="!requiresPickup && !requiresDelivery" x-cloak class="text-sm text-gray-500 dark:text-gray-400">Mode datang sendiri aktif. Ongkir otomatis Rp0.</p>
                    </div>
                </article>
            </section>

            <section class="{{ $card }}">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Item layanan</h3>
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Item wajib diisi untuk order tanpa jemput.</p>
                    </div>
                    <button type="button" @click="addRow()" :disabled="requiresPickup" class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5">Tambah item</button>
                </div>
                <div class="mt-5 space-y-3">
                    <template x-for="(row, index) in rows" :key="index">
                        <article class="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
                            <div class="grid gap-4 xl:grid-cols-[1.5fr_0.75fr_0.75fr_0.75fr_0.6fr]">
                                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    <span>Layanan</span>
                                    <select :name="`items[${index}][service_id]`" x-model="row.service_id" @change="onServiceChanged(row)" :required="requiresItems" :disabled="requiresPickup" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                                        <option value="">Pilih layanan</option>
                                        @foreach ($services as $service)
                                            <option value="{{ $service['id'] }}">{{ $service['name'] }} ({{ $service['unit_type'] }}) - Rp{{ number_format($service['base_price_amount'], 0, ',', '.') }}</option>
                                        @endforeach
                                    </select>
                                    <p class="text-xs text-gray-500 dark:text-gray-400" x-text="rowHint(row)"></p>
                                </label>
                                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    <span>Harga unit</span>
                                    <div class="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                        Rp<span x-text="formatCurrency(priceFor(row.service_id))"></span>
                                    </div>
                                </label>
                                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    <span>Qty (pcs)</span>
                                    <input type="number" step="0.01" min="0.01" :name="`items[${index}][qty]`" x-model="row.qty" :disabled="requiresPickup || unitOf(row.service_id) !== 'pcs'" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                                </label>
                                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                    <span>Berat (kg)</span>
                                    <input type="number" step="0.01" min="0.01" :name="`items[${index}][weight_kg]`" x-model="row.weight_kg" :disabled="requiresPickup || unitOf(row.service_id) !== 'kg'" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                                </label>
                                <div class="flex flex-col justify-between gap-2">
                                    <div class="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                        Rp<span x-text="formatCurrency(lineSubtotal(row))"></span>
                                    </div>
                                    <button type="button" @click="removeRow(index)" :disabled="requiresPickup || rows.length === 1" class="rounded-xl bg-danger-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Hapus</button>
                                </div>
                            </div>
                        </article>
                    </template>
                </div>
                <div class="mt-5 flex flex-col gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <p>Estimasi subtotal: <strong class="text-gray-900 dark:text-white">Rp<span x-text="formatCurrency(estimatedSubtotal)"></span></strong></p>
                    <p>Estimasi total: <strong class="text-gray-900 dark:text-white">Rp<span x-text="formatCurrency(estimatedTotal)"></span></strong></p>
                </div>
            </section>

            <section class="{{ $card }}">
                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>Catatan transaksi</span>
                    <textarea name="notes" rows="3" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">{{ old('notes') }}</textarea>
                </label>
                <div class="mt-4 flex flex-wrap gap-3">
                    <button type="submit" class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500">Simpan transaksi</button>
                    <a href="{{ \App\Filament\Resources\Orders\OrderResource::getUrl(name: 'index', panel: 'tenant') }}" class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5">Kembali ke order</a>
                </div>
            </section>
        </form>
    </div>

    <script>
        window.orderCreatePage = function (payload = {}) {
            return {
                services: Array.isArray(payload.services) ? payload.services : [],
                priceMap: payload.priceMap && typeof payload.priceMap === 'object' ? payload.priceMap : {},
                customers: Array.isArray(payload.customerSeeds) ? payload.customerSeeds : [],
                initial: payload.initial && typeof payload.initial === 'object' ? payload.initial : {},
                lookupQuery: '',
                lookupOpen: false,
                serviceLookup: {},
                outletId: '',
                requiresPickup: false,
                requiresDelivery: false,
                shippingFee: '0',
                discount: '0',
                rows: [],
                init() {
                    this.services.forEach((service) => {
                        this.serviceLookup[String(service.id)] = service;
                    });
                    this.outletId = String(this.initial.outlet_id ?? '');
                    this.requiresPickup = String(this.initial.requires_pickup ?? '') === '1';
                    this.requiresDelivery = String(this.initial.requires_delivery ?? '') === '1';
                    this.shippingFee = String(this.initial.shipping_fee_amount ?? '0');
                    this.discount = String(this.initial.discount_amount ?? '0');
                    this.rows = Array.isArray(this.initial.items) && this.initial.items.length > 0 ? this.initial.items : [this.emptyRow()];
                },
                emptyRow() {
                    return { service_id: '', qty: '', weight_kg: '' };
                },
                addRow() {
                    this.rows.push(this.emptyRow());
                },
                removeRow(index) {
                    if (this.rows.length <= 1) {
                        this.rows = [this.emptyRow()];
                        return;
                    }
                    this.rows.splice(index, 1);
                },
                chooseCustomer(item) {
                    this.$refs.customerName.value = String(item.name ?? '');
                    this.$refs.customerPhone.value = String(item.phone ?? '');
                    this.$refs.customerNotes.value = String(item.notes ?? '');
                    this.lookupQuery = `${item.name} (${item.phone})`;
                    this.lookupOpen = false;
                },
                get filteredCustomers() {
                    const query = this.lookupQuery.trim().toLowerCase();
                    if (! query) {
                        return this.customers.slice(0, 10);
                    }
                    return this.customers.filter((item) => {
                        const name = String(item.name ?? '').toLowerCase();
                        const phone = String(item.phone ?? '').toLowerCase();
                        return name.includes(query) || phone.includes(query);
                    }).slice(0, 12);
                },
                unitOf(serviceId) {
                    return String(this.serviceLookup[String(serviceId)]?.unit_type ?? '');
                },
                priceFor(serviceId) {
                    const outletMap = this.priceMap?.[String(this.outletId)] ?? null;
                    const key = String(serviceId ?? '');
                    if (outletMap && Object.prototype.hasOwnProperty.call(outletMap, key)) {
                        return Number(outletMap[key] ?? 0);
                    }
                    return Number(this.serviceLookup[key]?.base_price_amount ?? 0);
                },
                numberValue(value) {
                    const parsed = Number(value);
                    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
                },
                metricFor(row) {
                    return this.unitOf(row.service_id) === 'kg'
                        ? this.numberValue(row.weight_kg)
                        : this.numberValue(row.qty);
                },
                lineSubtotal(row) {
                    return Math.round(this.metricFor(row) * this.priceFor(row.service_id));
                },
                get estimatedSubtotal() {
                    if (this.requiresPickup) {
                        return 0;
                    }
                    return this.rows.reduce((sum, row) => sum + this.lineSubtotal(row), 0);
                },
                get estimatedTotal() {
                    const fee = this.requiresPickup || this.requiresDelivery ? Math.round(this.numberValue(this.shippingFee)) : 0;
                    const discount = Math.round(this.numberValue(this.discount));
                    return Math.max(this.estimatedSubtotal + fee - discount, 0);
                },
                get requiresItems() {
                    return ! this.requiresPickup;
                },
                onServiceChanged(row) {
                    const unit = this.unitOf(row.service_id);
                    if (unit === 'kg') {
                        row.qty = '';
                    } else if (unit === 'pcs') {
                        row.weight_kg = '';
                    } else {
                        row.qty = '';
                        row.weight_kg = '';
                    }
                },
                rowHint(row) {
                    if (this.requiresPickup) {
                        return 'Item layanan diinput setelah barang dijemput.';
                    }
                    const unit = this.unitOf(row.service_id);
                    if (! unit) {
                        return 'Pilih layanan terlebih dahulu.';
                    }
                    return unit === 'kg' ? 'Isi berat pada kolom kg.' : 'Isi jumlah pada kolom pcs.';
                },
                formatCurrency(value) {
                    return new Intl.NumberFormat('id-ID').format(Math.round(this.numberValue(value)));
                },
            };
        };
    </script>
</x-filament-panels::page>
