<x-filament-widgets::widget>
    <div class="fi-section rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div class="mb-4">
            <h2 class="text-base font-semibold text-gray-950">Jalur Fitur Lanjutan</h2>
            <p class="mt-1 text-sm text-gray-600">
                Modul yang belum dipindah penuh ke resource Filament tetap dibuka dari panel baru ini.
            </p>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            @foreach ($links as $link)
                <a
                    href="{{ $link['url'] }}"
                    class="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-primary-500 hover:bg-primary-50"
                >
                    <div class="text-sm font-semibold text-gray-950">{{ $link['title'] }}</div>
                    <div class="mt-2 text-sm text-gray-600">{{ $link['description'] }}</div>
                </a>
            @endforeach
        </div>
    </div>
</x-filament-widgets::widget>
