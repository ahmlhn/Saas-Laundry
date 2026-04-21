<x-filament-panels::page>
    @php
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
    @endphp

    <div class="space-y-6">
        <section class="{{ $card }}">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Platform</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Tenant subscriptions</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Pantau state subscription, plan aktif, dan cycle tenant dari panel Filament platform.</p>
                </div>
                <div class="rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">
                    Total tenant: <strong>{{ number_format($tenants->total(), 0, ',', '.') }}</strong>
                </div>
            </div>
        </section>

        <section class="{{ $card }}">
            <form method="GET" action="{{ \App\Filament\Platform\Pages\PlatformSubscriptions::getUrl(panel: 'platform') }}" class="grid gap-4 md:grid-cols-3">
                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>Cari tenant</span>
                    <input type="text" name="q" value="{{ $filters['q'] ?? '' }}" placeholder="Nama, ID, atau slug" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                </label>
                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>State</span>
                    <select name="state" class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        <option value="">Semua</option>
                        <option value="active" @selected(($filters['state'] ?? null) === 'active')>Active</option>
                        <option value="past_due" @selected(($filters['state'] ?? null) === 'past_due')>Past Due</option>
                        <option value="suspended" @selected(($filters['state'] ?? null) === 'suspended')>Suspended</option>
                    </select>
                </label>
                <div class="flex items-end gap-3">
                    <button type="submit" class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500">Terapkan</button>
                    <a href="{{ \App\Filament\Platform\Pages\PlatformSubscriptions::getUrl(panel: 'platform') }}" class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5">Reset</a>
                </div>
            </form>
        </section>

        <section class="{{ $card }}">
            <div class="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200 dark:divide-white/10">
                        <thead class="bg-gray-50 dark:bg-white/5">
                            <tr class="text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                                <th class="px-4 py-3">Tenant</th>
                                <th class="px-4 py-3">Plan</th>
                                <th class="px-4 py-3">State</th>
                                <th class="px-4 py-3">Write Mode</th>
                                <th class="px-4 py-3">Cycle</th>
                                <th class="px-4 py-3">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 bg-white text-sm dark:divide-white/10 dark:bg-gray-900">
                            @forelse ($tenants as $tenant)
                                <tr>
                                    <td class="px-4 py-4">
                                        <p class="font-semibold text-gray-950 dark:text-white">{{ $tenant->name }}</p>
                                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ $tenant->id }}</p>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ $tenant->slug }}</p>
                                    </td>
                                    <td class="px-4 py-4">
                                        <p class="font-medium text-gray-900 dark:text-white">{{ $tenant->currentPlan?->name ?? '-' }}</p>
                                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ strtoupper((string) ($tenant->currentPlan?->key ?? '-')) }}</p>
                                    </td>
                                    <td class="px-4 py-4">{{ strtoupper((string) ($tenant->subscription_state ?? 'active')) }}</td>
                                    <td class="px-4 py-4">{{ strtoupper((string) ($tenant->write_access_mode ?? 'full')) }}</td>
                                    <td class="px-4 py-4">
                                        @if ($tenant->currentSubscriptionCycle)
                                            <p class="font-medium text-gray-900 dark:text-white">{{ $tenant->currentSubscriptionCycle->cycle_start_at?->format('d M Y') }} - {{ $tenant->currentSubscriptionCycle->cycle_end_at?->format('d M Y') }}</p>
                                            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ strtoupper((string) $tenant->currentSubscriptionCycle->status) }}</p>
                                        @else
                                            <p class="text-xs text-gray-500 dark:text-gray-400">Belum ada cycle</p>
                                        @endif
                                    </td>
                                    <td class="px-4 py-4">
                                        <a href="{{ \App\Filament\Platform\Pages\PlatformTenantSubscription::getUrl(parameters: ['tenant' => $tenant], panel: 'platform') }}" class="inline-flex rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5">Buka</a>
                                    </td>
                                </tr>
                            @empty
                                <tr>
                                    <td colspan="6" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Data tenant tidak ditemukan.</td>
                                </tr>
                            @endforelse
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mt-4">
                {{ $tenants->links() }}
            </div>
        </section>
    </div>
</x-filament-panels::page>
