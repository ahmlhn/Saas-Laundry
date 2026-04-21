<x-filament-panels::page>
    @php
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
        $canMutate = \App\Filament\Platform\Support\PlatformPanelAccess::isPlatformOwner();
    @endphp

    <div class="space-y-6">
        <section class="{{ $card }}">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Tenant</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">{{ $tenantSummary['name'] ?? '-' }}</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ $tenantSummary['id'] ?? '-' }} · {{ $tenantSummary['slug'] ?? '-' }}</p>
                </div>
                <div class="grid gap-3 sm:grid-cols-3">
                    <div class="rounded-xl bg-primary-50 p-4 dark:bg-primary-500/10">
                        <p class="text-xs text-primary-700 dark:text-primary-200">State</p>
                        <p class="mt-2 text-lg font-semibold text-primary-950 dark:text-white">{{ strtoupper((string) ($tenantSummary['subscription_state'] ?? '-')) }}</p>
                    </div>
                    <div class="rounded-xl bg-gray-100 p-4 dark:bg-white/5">
                        <p class="text-xs text-gray-600 dark:text-gray-300">Write mode</p>
                        <p class="mt-2 text-lg font-semibold text-gray-950 dark:text-white">{{ strtoupper((string) ($tenantSummary['write_access_mode'] ?? '-')) }}</p>
                    </div>
                    <div class="rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10">
                        <p class="text-xs text-amber-700 dark:text-amber-200">Plan</p>
                        <p class="mt-2 text-lg font-semibold text-amber-950 dark:text-white">{{ $tenantSummary['plan_name'] ?? '-' }}</p>
                    </div>
                </div>
            </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <article class="{{ $card }}">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Ringkasan subscription</h3>
                <div class="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                        <tbody class="divide-y divide-gray-200 bg-white text-sm dark:divide-white/10 dark:bg-gray-900">
                            <tr><th class="w-56 px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Plan aktif</th><td class="px-4 py-3 text-gray-950 dark:text-white">{{ $tenantSummary['plan_name'] ?? '-' }} ({{ strtoupper((string) ($tenantSummary['plan_key'] ?? '-')) }})</td></tr>
                            <tr><th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Limit order</th><td class="px-4 py-3 text-gray-950 dark:text-white">{{ $tenantSummary['orders_limit'] ?? 'Tak terbatas' }}</td></tr>
                            <tr><th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Cycle</th><td class="px-4 py-3 text-gray-950 dark:text-white">{{ $tenantSummary['cycle_start_at'] ?? '-' }} - {{ $tenantSummary['cycle_end_at'] ?? '-' }}</td></tr>
                            <tr><th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">Cycle status</th><td class="px-4 py-3 text-gray-950 dark:text-white">{{ strtoupper((string) ($tenantSummary['cycle_status'] ?? '-')) }}</td></tr>
                        </tbody>
                    </table>
                </div>
            </article>

            <article class="{{ $card }}">
                <div class="flex items-center justify-between gap-3">
                    <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Kontrol tenant</h3>
                    <span class="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{{ $canMutate ? 'Editable' : 'Read only' }}</span>
                </div>
                <div class="mt-4 rounded-2xl border border-dashed border-gray-200 p-4 dark:border-white/10">
                    <p class="text-sm text-gray-600 dark:text-gray-300">Aksi suspend dan activate sekarang dijalankan langsung dari header action Filament di halaman ini.</p>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">State saat ini: <span class="font-medium text-gray-950 dark:text-white">{{ strtoupper((string) ($tenantSummary['subscription_state'] ?? '-')) }}</span> dengan mode tulis <span class="font-medium text-gray-950 dark:text-white">{{ strtoupper((string) ($tenantSummary['write_access_mode'] ?? '-')) }}</span>.</p>
                </div>
                @unless ($canMutate)
                    <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">Hanya `platform_owner` yang bisa suspend atau activate tenant.</p>
                @endunless
            </article>
        </section>

        <section class="{{ $card }}">
            <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Invoice langganan</h3>
                <span class="text-sm text-gray-500 dark:text-gray-400">{{ number_format(count($invoices), 0, ',', '.') }} invoice terbaru</span>
            </div>
            <div class="mt-4 space-y-4">
                @forelse ($invoices as $invoice)
                    <article class="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
                        <div class="grid gap-4 xl:grid-cols-[1fr_0.8fr_1.2fr]">
                            <div>
                                <p class="text-sm font-semibold text-gray-950 dark:text-white">{{ $invoice['invoice_no'] }}</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Status {{ strtoupper($invoice['status']) }} · {{ strtoupper($invoice['payment_method']) }}</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Terbit {{ $invoice['issued_at'] }} · Jatuh tempo {{ $invoice['due_at'] }}</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Nominal Rp{{ number_format((int) $invoice['amount_total'], 0, ',', '.') }}</p>
                            </div>
                            <div>
                                <p class="text-sm font-semibold text-gray-950 dark:text-white">Gateway</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ strtoupper($invoice['gateway_status']) }}</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Ref {{ $invoice['gateway_reference'] }}</p>
                                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Event {{ strtoupper($invoice['latest_event_status']) }} · {{ $invoice['latest_event_at'] }}</p>
                            </div>
                            <div class="space-y-3">
                                <div>
                                    <p class="text-sm font-semibold text-gray-950 dark:text-white">Bukti</p>
                                    @forelse ($invoice['proofs'] as $proof)
                                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ $proof['file_name'] }} · {{ strtoupper($proof['status']) }} · {{ $proof['created_at'] }}</p>
                                    @empty
                                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Belum ada bukti.</p>
                                    @endforelse
                                </div>
                                @if ($invoice['payment_method'] === 'bri_qris')
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Auto-verify via webhook gateway.</p>
                                @else
                                    <form wire:submit.prevent="verifyInvoice('{{ $invoice['id'] }}')" class="grid gap-3 md:grid-cols-[0.7fr_1fr_auto]">
                                        <select wire:model="invoiceDecision.{{ $invoice['id'] }}" required class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white" @disabled(! $canMutate)>
                                            <option value="approve">Approve</option>
                                            <option value="reject">Reject</option>
                                        </select>
                                        <input type="text" wire:model.blur="invoiceNote.{{ $invoice['id'] }}" maxlength="500" placeholder="Catatan verifikasi" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white" @disabled(! $canMutate)>
                                        <button type="submit" class="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200" @disabled(! $canMutate) wire:loading.attr="disabled" wire:target="verifyInvoice">Proses</button>
                                    </form>
                                    @error('invoiceDecision.'.$invoice['id'])
                                        <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                                    @enderror
                                    @error('invoiceNote.'.$invoice['id'])
                                        <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                                    @enderror
                                @endif
                            </div>
                        </div>
                    </article>
                @empty
                    <p class="text-sm text-gray-500 dark:text-gray-400">Belum ada invoice langganan.</p>
                @endforelse
            </div>
        </section>

        <section class="{{ $card }}">
            <div class="flex items-center justify-between gap-3">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Gateway payment events</h3>
                <span class="text-sm text-gray-500 dark:text-gray-400">{{ number_format(count($paymentEvents), 0, ',', '.') }} event terbaru</span>
            </div>
            <div class="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                        <thead class="bg-gray-50 dark:bg-white/5">
                            <tr class="text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                <th class="px-4 py-3">Waktu</th>
                                <th class="px-4 py-3">Gateway Event</th>
                                <th class="px-4 py-3">Status</th>
                                <th class="px-4 py-3">Invoice</th>
                                <th class="px-4 py-3">Nominal</th>
                                <th class="px-4 py-3">Reason</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 bg-white text-sm dark:divide-white/10 dark:bg-gray-900">
                            @forelse ($paymentEvents as $event)
                                <tr>
                                    <td class="px-4 py-3">{{ $event['received_at'] }}</td>
                                    <td class="px-4 py-3">
                                        <p class="font-medium text-gray-950 dark:text-white">{{ $event['gateway_event_id'] }}</p>
                                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ strtoupper($event['event_type']) }}</p>
                                    </td>
                                    <td class="px-4 py-3">{{ strtoupper($event['process_status']) }}</td>
                                    <td class="px-4 py-3">{{ $event['invoice_no'] }}</td>
                                    <td class="px-4 py-3">{{ $event['amount_total'] !== null ? 'Rp'.number_format((int) $event['amount_total'], 0, ',', '.') : '-' }}</td>
                                    <td class="px-4 py-3">{{ $event['rejection_reason'] }}</td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="6" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Belum ada event pembayaran gateway.</td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    </div>
</x-filament-panels::page>
