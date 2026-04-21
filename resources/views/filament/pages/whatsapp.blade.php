<x-filament-panels::page>
    @php
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
        $messageLabel = fn (string $status): string => match ($status) {
            'queued' => 'Dalam antrean',
            'sent' => 'Terkirim',
            'delivered' => 'Diterima',
            'failed' => 'Gagal',
            default => str_replace('_', ' ', $status),
        };
        $sourceLabel = fn (string $source): string => match ($source) {
            'default' => 'Bawaan',
            'tenant_override' => 'Override tenant',
            'outlet_override' => 'Override outlet',
            default => str_replace('_', ' ', $source),
        };
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
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">WhatsApp Tenant</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Provider, template, dan log pengiriman</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Resolver template dan jalur pengiriman tetap sama, hanya shell operasionalnya dipindah ke Filament.</p>
                </div>
                <div class="grid gap-3 sm:grid-cols-4">
                    <div class="rounded-xl bg-primary-50 p-4 dark:bg-primary-500/10"><p class="text-xs text-primary-700">Provider aktif</p><p class="mt-2 font-semibold text-primary-950 dark:text-white">{{ number_format((int) ($providerSummary['active_count'] ?? 0), 0, ',', '.') }}</p><p class="text-xs text-primary-700">{{ $providerSummary['active_provider_key'] !== '' ? strtoupper($providerSummary['active_provider_key']) : 'belum dipilih' }}</p></div>
                    <div class="rounded-xl bg-gray-100 p-4 dark:bg-white/5"><p class="text-xs text-gray-600">Template</p><p class="mt-2 font-semibold text-gray-950 dark:text-white">{{ number_format((int) ($templateSummary['total'] ?? 0), 0, ',', '.') }}</p><p class="text-xs text-gray-500">Override {{ number_format((int) ($templateSummary['override_count'] ?? 0), 0, ',', '.') }}</p></div>
                    <div class="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10"><p class="text-xs text-emerald-700">Berhasil</p><p class="mt-2 font-semibold text-emerald-950 dark:text-white">{{ number_format((int) ($messageSummary['sent'] ?? 0), 0, ',', '.') }}</p><p class="text-xs text-emerald-700">Total {{ number_format((int) ($messageSummary['total'] ?? 0), 0, ',', '.') }}</p></div>
                    <div class="rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10"><p class="text-xs text-amber-700">Rasio gagal</p><p class="mt-2 font-semibold text-amber-950 dark:text-white">{{ number_format((int) ($messageSummary['failure_rate'] ?? 0), 0, ',', '.') }}%</p><p class="text-xs text-amber-700">Last sent {{ $messageSummary['last_sent_at'] ?? '-' }}</p></div>
                </div>
            </div>
        </section>

        <section class="grid gap-6 xl:grid-cols-2">
            <article class="{{ $card }}">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Konfigurasi provider</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Satu provider aktif menentukan jalur pengiriman tenant.</p>
                <form method="POST" action="{{ route('tenant.wa.provider-config') }}" class="mt-5 grid gap-4">
                    @csrf
                    <select name="provider_key" required class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @foreach ($providerRows as $provider)
                            <option value="{{ $provider['provider_key'] }}">{{ $provider['provider_name'] }} ({{ $provider['provider_key'] }})</option>
                        @endforeach
                    </select>
                    <input type="text" name="sender" placeholder="Sender / device" class="rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <div class="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">
                        <p class="font-medium text-gray-900 dark:text-white">Kredensial MPWA dari environment</p>
                        <p class="mt-1">API key: {{ config('services.mpwa.api_key') ? 'terisi' : 'belum diisi' }}</p>
                        <p>Base URL: {{ config('services.mpwa.base_url') ?: 'belum diisi' }}</p>
                    </div>
                    <label class="inline-flex items-center gap-3 text-sm"><input type="checkbox" name="is_active" value="1" checked> Aktifkan provider ini</label>
                    <button type="submit" class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white">Simpan konfigurasi</button>
                </form>
            </article>

            <article class="{{ $card }}">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Status provider</h3>
                <div class="mt-5 space-y-3">
                    @foreach ($providerRows as $provider)
                        <article class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <p class="font-medium text-gray-950 dark:text-white">{{ $provider['provider_name'] }}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ $provider['provider_key'] }} • sender {{ $provider['sender'] }}</p>
                                </div>
                                <div class="text-right text-sm">
                                    <p>{{ $provider['configured'] ? 'Configured' : 'Belum' }}</p>
                                    <p class="text-gray-500 dark:text-gray-400">{{ $provider['is_active'] ? 'Aktif' : 'Nonaktif' }} • {{ $provider['updated_at'] }}</p>
                                </div>
                            </div>
                        </article>
                    @endforeach
                </div>
            </article>
        </section>

        <section class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <article class="{{ $card }}">
                <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Sumber template</h3>
                <div class="mt-4 overflow-x-auto">
                    <table class="min-w-full text-sm">
                        <thead><tr class="border-b text-left text-gray-500"><th class="py-2 pr-4">Template</th><th class="py-2 pr-4">Sumber</th><th class="py-2">Versi</th></tr></thead>
                        <tbody>
                            @foreach ($templateRows as $row)
                                <tr class="border-b border-gray-100 dark:border-white/5">
                                    <td class="py-2 pr-4">{{ $row['template_id'] }}</td>
                                    <td class="py-2 pr-4">{{ $sourceLabel($row['source']) }}</td>
                                    <td class="py-2">{{ $row['version'] }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            </article>

            <article class="{{ $card }}">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-950 dark:text-white">Log pengiriman</h3>
                        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">50 log terakhir dengan filter outlet.</p>
                    </div>
                    <form method="GET" action="{{ \App\Filament\Pages\WhatsApp::getUrl(panel: 'tenant') }}" class="w-full md:max-w-xs">
                        <select name="outlet_id" onchange="this.form.submit()" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                            <option value="">Semua outlet</option>
                            @foreach ($outlets as $outlet)
                                <option value="{{ $outlet['id'] }}" @selected($selectedOutletId === $outlet['id'])>{{ $outlet['name'] }}</option>
                            @endforeach
                        </select>
                    </form>
                </div>
                <div class="mt-5 space-y-3">
                    @forelse ($messages as $message)
                        <article class="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <p class="font-medium text-gray-950 dark:text-white">{{ $message['template_id'] }}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">{{ $message['to_phone'] }} • {{ $message['created_at'] }}</p>
                                </div>
                                <div class="text-right text-sm">
                                    <p>{{ $messageLabel($message['status']) }}</p>
                                    <p class="text-gray-500 dark:text-gray-400">{{ number_format((int) $message['attempts'], 0, ',', '.') }} percobaan • {{ $message['last_error_code'] }}</p>
                                </div>
                            </div>
                        </article>
                    @empty
                        <p class="text-sm text-gray-500 dark:text-gray-400">Belum ada log pesan.</p>
                    @endforelse
                </div>
            </article>
        </section>
    </div>
</x-filament-panels::page>
