<x-filament-panels::page>
    @php
        $money = fn ($amount): string => 'Rp' . number_format((int) $amount, 0, ',', '.');
        $limit = is_null($quota['orders_limit'] ?? null) ? 'Tak terbatas' : number_format((int) ($quota['orders_limit'] ?? 0), 0, ',', '.');
        $remaining = is_null($quota['orders_remaining'] ?? null) ? 'Tak terbatas' : number_format((int) ($quota['orders_remaining'] ?? 0), 0, ',', '.');
        $params = array_filter(['period' => $period, 'outlet_id' => $selectedOutletId, 'payment_status' => $selectedPaymentStatus, 'aging_bucket' => $selectedAgingBucket, 'collection_status' => $selectedCollectionStatus, 'cash_date' => $cashDate]);
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
    @endphp

    <div class="space-y-6">
        @if (session('status'))
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ session('status') }}</div>
        @endif

        <section class="{{ $card }}">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Billing Tenant</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Kuota, piutang, dan kas harian</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ $selectedOutletLabel }} | {{ $selectedPaymentStatusLabel }} | {{ $selectedAgingBucketLabel }} | {{ $selectedCollectionStatusLabel }}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <a href="{{ route('tenant.billing.export', $params + ['dataset' => 'outlets']) }}" class="rounded-xl border px-3 py-2 text-sm">Outlet CSV</a>
                    <a href="{{ route('tenant.billing.export', $params + ['dataset' => 'usage']) }}" class="rounded-xl border px-3 py-2 text-sm">Riwayat CSV</a>
                    <a href="{{ route('tenant.billing.export', $params + ['dataset' => 'aging']) }}" class="rounded-xl border px-3 py-2 text-sm">Aging CSV</a>
                    <a href="{{ route('tenant.billing.export', $params + ['dataset' => 'cash_daily']) }}" class="rounded-xl border px-3 py-2 text-sm">Kas CSV</a>
                </div>
            </div>

            <form method="GET" action="{{ \App\Filament\Pages\Billing::getUrl(panel: 'tenant') }}" class="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <input type="month" name="period" value="{{ $period }}" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                <select name="outlet_id" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <option value="">Semua outlet</option>
                    @foreach ($availableOutlets as $outlet)
                        <option value="{{ $outlet['id'] }}" @selected($selectedOutletId === $outlet['id'])>{{ $outlet['name'] }}</option>
                    @endforeach
                </select>
                <select name="payment_status" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <option value="">Semua pembayaran</option>
                    <option value="paid" @selected($selectedPaymentStatus === 'paid')>Lunas</option>
                    <option value="partial" @selected($selectedPaymentStatus === 'partial')>Sebagian</option>
                    <option value="unpaid" @selected($selectedPaymentStatus === 'unpaid')>Belum bayar</option>
                </select>
                <select name="aging_bucket" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <option value="">Semua aging</option>
                    <option value="d0_7" @selected($selectedAgingBucket === 'd0_7')>0-7 hari</option>
                    <option value="d8_14" @selected($selectedAgingBucket === 'd8_14')>8-14 hari</option>
                    <option value="d15_30" @selected($selectedAgingBucket === 'd15_30')>15-30 hari</option>
                    <option value="d31_plus" @selected($selectedAgingBucket === 'd31_plus')>>30 hari</option>
                </select>
                <select name="collection_status" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <option value="">Semua penagihan</option>
                    <option value="pending" @selected($selectedCollectionStatus === 'pending')>Pending</option>
                    <option value="contacted" @selected($selectedCollectionStatus === 'contacted')>Contacted</option>
                    <option value="promise_to_pay" @selected($selectedCollectionStatus === 'promise_to_pay')>Promise</option>
                    <option value="escalated" @selected($selectedCollectionStatus === 'escalated')>Escalated</option>
                    <option value="resolved" @selected($selectedCollectionStatus === 'resolved')>Resolved</option>
                </select>
                <div class="flex gap-2">
                    <input type="date" name="cash_date" value="{{ $cashDate }}" class="min-w-0 flex-1 rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <button type="submit" class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white">Terapkan</button>
                </div>
            </form>
        </section>

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            @foreach ([
                ['Kuota', $limit, 'Sisa ' . $remaining],
                ['Order periode', number_format($ordersCount, 0, ',', '.'), 'Bruto ' . $money($grossAmount)],
                ['Pembayaran masuk', $money($paidAmount), 'Piutang ' . $money($outstandingAmount)],
                ['Kas harian', $money($cashReconciliation['total_collected'] ?? 0), number_format((int) ($cashReconciliation['transactions_count'] ?? 0), 0, ',', '.') . ' transaksi'],
            ] as [$label, $value, $note])
                <article class="{{ $card }}">
                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ $label }}</p>
                    <p class="mt-3 text-2xl font-semibold text-gray-950 dark:text-white">{{ $value }}</p>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ $note }}</p>
                </article>
            @endforeach
        </section>

        <section class="grid gap-6 xl:grid-cols-2">
            <article class="{{ $card }}">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Riwayat kuota 6 bulan</h3>
                <div class="mt-4 overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead><tr class="border-b text-left text-gray-500"><th class="py-2 pr-4">Periode</th><th class="py-2 pr-4">Kuota</th><th class="py-2 pr-4">Terpakai</th><th class="py-2 pr-4">Order</th><th class="py-2">Bayar</th></tr></thead>
                        <tbody>
                            @foreach ($usageHistory as $row)
                                <tr class="border-b border-gray-100 dark:border-white/5">
                                    <td class="py-2 pr-4">{{ $row['label'] }}</td>
                                    <td class="py-2 pr-4">{{ is_null($row['orders_limit']) ? 'Tak terbatas' : number_format((int) $row['orders_limit'], 0, ',', '.') }}</td>
                                    <td class="py-2 pr-4">{{ number_format((int) $row['orders_used'], 0, ',', '.') }}</td>
                                    <td class="py-2 pr-4">{{ number_format((int) $row['orders_count'], 0, ',', '.') }}</td>
                                    <td class="py-2">{{ $money($row['paid_amount']) }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            </article>

            <article class="{{ $card }}">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Outlet performance</h3>
                <div class="mt-4 space-y-3">
                    @forelse ($outletSummary as $row)
                        <div class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <p class="font-medium text-gray-950 dark:text-white">{{ $row['outlet_name'] }}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ number_format((int) $row['orders_count'], 0, ',', '.') }} order</p>
                                </div>
                                <div class="text-right text-sm">
                                    <p>{{ $money($row['gross_amount']) }}</p>
                                    <p class="text-gray-500 dark:text-gray-400">Piutang {{ $money($row['due_amount']) }}</p>
                                </div>
                            </div>
                        </div>
                    @empty
                        <p class="text-sm text-gray-500 dark:text-gray-400">Belum ada transaksi pada periode ini.</p>
                    @endforelse
                </div>
            </article>
        </section>

        <section class="{{ $card }}">
            <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Invoice aging</h3>
            <div class="mt-4 grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead><tr class="border-b text-left text-gray-500"><th class="py-2 pr-4">Bucket</th><th class="py-2 pr-4">Order</th><th class="py-2">Piutang</th></tr></thead>
                        <tbody>
                            @forelse ($agingSummary as $bucket)
                                <tr class="border-b border-gray-100 dark:border-white/5">
                                    <td class="py-2 pr-4">{{ $bucket['bucket_label'] }}</td>
                                    <td class="py-2 pr-4">{{ number_format((int) $bucket['orders_count'], 0, ',', '.') }}</td>
                                    <td class="py-2">{{ $money($bucket['due_amount']) }}</td>
                                </tr>
                            @empty
                                <tr><td class="py-2 text-gray-500" colspan="3">Belum ada data aging.</td></tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
                <div class="space-y-3">
                    @forelse (array_slice($agingOrderDetails, 0, 12) as $row)
                        <article class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                            <div class="flex flex-col gap-3 lg:flex-row lg:justify-between">
                                <div>
                                    <p class="font-medium text-gray-950 dark:text-white">{{ $row['invoice_or_order_code'] }} • {{ $money($row['due_amount']) }}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ $row['customer_name'] }} • {{ $row['outlet_name'] }} • {{ $row['bucket_label'] }}</p>
                                </div>
                                <form method="POST" action="{{ route('tenant.billing.collection.update', ['order' => $row['order_id']]) }}" class="grid gap-2 lg:w-72">
                                    @csrf
                                    <select name="collection_status" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                                        <option value="pending" @selected($row['collection_status'] === 'pending')>Pending</option>
                                        <option value="contacted" @selected($row['collection_status'] === 'contacted')>Contacted</option>
                                        <option value="promise_to_pay" @selected($row['collection_status'] === 'promise_to_pay')>Promise</option>
                                        <option value="escalated" @selected($row['collection_status'] === 'escalated')>Escalated</option>
                                        <option value="resolved" @selected($row['collection_status'] === 'resolved')>Resolved</option>
                                    </select>
                                    <input type="datetime-local" name="collection_next_follow_up_at" value="{{ $row['collection_next_follow_up_at_input'] }}" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                                    <button type="submit" class="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-950">Simpan</button>
                                </form>
                            </div>
                        </article>
                    @empty
                        <p class="text-sm text-gray-500 dark:text-gray-400">Belum ada detail aging untuk filter ini.</p>
                    @endforelse
                </div>
            </div>
        </section>
    </div>
</x-filament-panels::page>
