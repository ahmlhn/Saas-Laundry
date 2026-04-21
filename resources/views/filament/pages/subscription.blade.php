<x-filament-panels::page>
    @php
        $money = fn ($amount): string => 'Rp' . number_format((int) $amount, 0, ',', '.');
        $limit = is_null($quota['orders_limit'] ?? null) ? 'Tak terbatas' : number_format((int) ($quota['orders_limit'] ?? 0), 0, ',', '.');
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
    @endphp

    <div class="space-y-6">
        @if (session('status'))
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{{ session('status') }}</div>
        @endif

        @if ($errors->any())
            <div class="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
                <ul class="space-y-1">@foreach ($errors->all() as $error)<li>{{ $error }}</li>@endforeach</ul>
            </div>
        @endif

        <section class="{{ $card }}">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Subscription Tenant</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Plan, siklus, dan invoice langganan</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Flow pembayaran dan request perubahan paket tetap memakai endpoint yang sama, hanya antarmukanya dipindah ke Filament.</p>
                </div>
                <div class="grid gap-3 sm:grid-cols-4">
                    <div class="rounded-xl bg-primary-50 p-4 dark:bg-primary-500/10"><p class="text-xs text-primary-700">Plan aktif</p><p class="mt-2 font-semibold text-primary-950 dark:text-white">{{ $currentPlan['name'] }}</p><p class="text-xs text-primary-700">{{ strtoupper($currentPlan['key']) }}</p></div>
                    <div class="rounded-xl bg-gray-100 p-4 dark:bg-white/5"><p class="text-xs text-gray-600">Status</p><p class="mt-2 font-semibold text-gray-950 dark:text-white">{{ strtoupper($subscriptionState) }}</p><p class="text-xs text-gray-500">Write {{ strtoupper($writeAccessMode) }}</p></div>
                    <div class="rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10"><p class="text-xs text-amber-700">Kuota</p><p class="mt-2 font-semibold text-amber-950 dark:text-white">{{ number_format((int) ($quota['orders_used'] ?? 0), 0, ',', '.') }} / {{ $limit }}</p><p class="text-xs text-amber-700">{{ $quota['period'] ?? now()->format('Y-m') }}</p></div>
                    <div class="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><p class="text-xs text-emerald-700">Harga</p><p class="mt-2 font-semibold text-emerald-950 dark:text-white">{{ $money($currentPlan['monthly_price_amount']) }}</p><p class="text-xs text-emerald-700">{{ $currentPlan['currency'] }}</p></div>
                </div>
            </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-2">
            <article class="{{ $card }}">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Siklus aktif</h3>
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Snapshot cycle yang sedang berjalan.</p>
                    </div>
                    <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-white/5 dark:text-gray-300">{{ $activeCycle ? 'Aktif' : 'Belum ada' }}</span>
                </div>

                @if ($activeCycle)
                    <dl class="mt-5 grid gap-4 sm:grid-cols-2">
                        <div><dt class="text-xs uppercase tracking-wide text-gray-500">Plan</dt><dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ $activeCycle['plan_name'] }} ({{ strtoupper($activeCycle['plan_key']) }})</dd></div>
                        <div><dt class="text-xs uppercase tracking-wide text-gray-500">Status</dt><dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ strtoupper($activeCycle['status']) }}</dd></div>
                        <div><dt class="text-xs uppercase tracking-wide text-gray-500">Mulai</dt><dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ $activeCycle['cycle_start_at'] }}</dd></div>
                        <div><dt class="text-xs uppercase tracking-wide text-gray-500">Berakhir</dt><dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ $activeCycle['cycle_end_at'] }}</dd></div>
                        <div><dt class="text-xs uppercase tracking-wide text-gray-500">Auto renew</dt><dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ $activeCycle['auto_renew'] ? 'ON' : 'OFF' }}</dd></div>
                        <div><dt class="text-xs uppercase tracking-wide text-gray-500">Limit snapshot</dt><dd class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ is_null($activeCycle['orders_limit_snapshot']) ? 'Tak terbatas' : number_format((int) $activeCycle['orders_limit_snapshot'], 0, ',', '.') }}</dd></div>
                    </dl>
                @else
                    <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">Belum ada subscription cycle aktif.</p>
                @endif
            </article>

            <article class="{{ $card }}">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Request perubahan paket</h3>
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Satu request pending per tenant owner.</p>
                    </div>
                    <span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">{{ $pendingChange ? 'Pending' : 'Kosong' }}</span>
                </div>

                @if ($pendingChange)
                    <div class="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                        <p class="text-sm text-amber-900 dark:text-amber-100">Target {{ $pendingChange['target_plan_name'] }} ({{ strtoupper($pendingChange['target_plan_key']) }}) • {{ $money($pendingChange['target_plan_price']) }}</p>
                        <p class="mt-1 text-sm text-amber-800 dark:text-amber-200">Efektif {{ $pendingChange['effective_at'] }}</p>
                        <form method="POST" action="{{ route('tenant.subscription.change-request.cancel', ['changeRequestId' => $pendingChange['id']]) }}" class="mt-3">
                            @csrf
                            @method('DELETE')
                            <button type="submit" class="rounded-xl bg-white px-4 py-2 text-sm font-medium text-amber-900 dark:bg-gray-950 dark:text-amber-200">Batalkan request</button>
                        </form>
                    </div>
                @else
                    <form method="POST" action="{{ route('tenant.subscription.change-request.store') }}" class="mt-5 grid gap-4">
                        @csrf
                        <select name="target_plan_id" required class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                            <option value="">Pilih paket</option>
                            @foreach ($plans as $plan)
                                <option value="{{ $plan['id'] }}" @disabled($currentPlan['id'] === $plan['id'])>{{ $plan['name'] }} ({{ strtoupper($plan['key']) }}) - {{ $money($plan['monthly_price_amount']) }}</option>
                            @endforeach
                        </select>
                        <input type="text" name="note" maxlength="500" placeholder="Catatan opsional" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        <button type="submit" class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white">Ajukan perubahan paket</button>
                    </form>
                @endif
            </article>
        </section>

        <section class="{{ $card }}">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Invoice langganan</h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">20 invoice terakhir, termasuk gateway QRIS dan upload bukti transfer legacy.</p>
                </div>
                <span class="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-200">{{ number_format(count($invoices), 0, ',', '.') }} invoice</span>
            </div>

            <div class="mt-5 space-y-4">
                @forelse ($invoices as $invoice)
                    <article class="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
                        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <p class="font-semibold text-gray-950 dark:text-white">{{ $invoice['invoice_no'] }}</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ strtoupper($invoice['status']) }} • {{ strtoupper($invoice['payment_method']) }} • {{ $money($invoice['amount_total']) }}</p>
                                <p class="text-sm text-gray-500 dark:text-gray-400">Terbit {{ $invoice['issued_at'] }} • jatuh tempo {{ $invoice['due_at'] }}</p>
                            </div>
                            <div class="w-full max-w-xl space-y-3">
                                @if ($invoice['payment_method'] === 'bri_qris')
                                    <div class="rounded-xl bg-gray-50 p-4 text-sm dark:bg-white/5">
                                        <p class="font-medium text-gray-900 dark:text-white">Gateway {{ strtoupper($invoice['gateway_status']) }}</p>
                                        <p class="text-gray-500 dark:text-gray-400">Reference {{ $invoice['gateway_reference'] }}</p>
                                        @if ($invoice['latest_event_status'] !== '')<p class="text-gray-500 dark:text-gray-400">{{ strtoupper($invoice['latest_event_status']) }} • {{ $invoice['latest_event_at'] }}</p>@endif
                                        <p class="text-gray-500 dark:text-gray-400">Expire {{ $invoice['qris_expires_at'] }}</p>
                                    </div>
                                    <form method="POST" action="{{ route('tenant.subscription.invoices.qris-intent', ['invoiceId' => $invoice['id']]) }}">
                                        @csrf
                                        <button type="submit" class="rounded-xl border px-4 py-2 text-sm font-medium">Refresh QRIS intent</button>
                                    </form>
                                @else
                                    <div class="rounded-xl bg-gray-50 p-4 text-sm dark:bg-white/5">
                                        <p class="font-medium text-gray-900 dark:text-white">{{ number_format((int) $invoice['proofs_count'], 0, ',', '.') }} bukti tersimpan</p>
                                    </div>
                                    <form method="POST" action="{{ route('tenant.subscription.invoices.proof.upload', ['invoiceId' => $invoice['id']]) }}" enctype="multipart/form-data" class="grid gap-3">
                                        @csrf
                                        <input type="file" name="proof_file" accept=".jpg,.jpeg,.png,.pdf" required class="block w-full text-sm">
                                        <input type="text" name="note" maxlength="500" placeholder="Catatan bukti" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                                        <button type="submit" class="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-gray-950">Upload bukti</button>
                                    </form>
                                @endif
                            </div>
                        </div>
                    </article>
                @empty
                    <p class="text-sm text-gray-500 dark:text-gray-400">Belum ada invoice langganan.</p>
                @endforelse
            </div>
        </section>
    </div>
</x-filament-panels::page>
