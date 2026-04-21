<x-filament-panels::page>
    @php
        $card = 'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-950/5 dark:bg-gray-900 dark:ring-white/10';
    @endphp

    <div class="space-y-6">
        <section class="{{ $card }}">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-600">Platform Android</p>
                    <h2 class="mt-1 text-2xl font-semibold text-gray-950 dark:text-white">Release Android</h2>
                    <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Kelola metadata update aplikasi Android yang dipakai endpoint publik dan halaman unduhan server.</p>
                </div>
                <span class="inline-flex rounded-full bg-primary-50 px-4 py-2 text-sm font-medium text-primary-800 dark:bg-primary-500/10 dark:text-primary-200">
                    {{ $isEditable ? 'Editable' : 'Read only' }}
                </span>
            </div>
        </section>

        <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article class="{{ $card }}">
                <p class="text-xs text-gray-500 dark:text-gray-400">Versi publik</p>
                <p class="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{{ $release['version'] }}</p>
            </article>
            <article class="{{ $card }}">
                <p class="text-xs text-gray-500 dark:text-gray-400">Build</p>
                <p class="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{{ $release['build'] }}</p>
            </article>
            <article class="{{ $card }}">
                <p class="text-xs text-gray-500 dark:text-gray-400">Minimal didukung</p>
                <p class="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{{ $release['minimum_supported_version'] ?? '-' }}</p>
            </article>
            <article class="{{ $card }}">
                <p class="text-xs text-gray-500 dark:text-gray-400">Sumber data</p>
                <p class="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{{ $setting ? 'DATABASE' : 'ENV' }}</p>
            </article>
        </section>

        <section class="{{ $card }}">
            <form wire:submit.prevent="saveRelease" class="space-y-5">

                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Version</span>
                        <input type="text" wire:model.blur="version" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @error('version')
                            <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                        @enderror
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Build</span>
                        <input type="number" min="1" wire:model.blur="build" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @error('build')
                            <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                        @enderror
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Minimum supported version</span>
                        <input type="text" wire:model.blur="minimumSupportedVersion" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @error('minimumSupportedVersion')
                            <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                        @enderror
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Published at</span>
                        <input type="datetime-local" wire:model.blur="publishedAtInput" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @error('publishedAtInput')
                            <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                        @enderror
                    </label>
                </div>

                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>Download URL APK</span>
                    <input type="url" wire:model.blur="downloadUrl" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Boleh isi URL manual, atau upload APK baru agar URL ini diperbarui otomatis.</p>
                    @error('downloadUrl')
                        <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                    @enderror
                </label>

                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>Upload APK</span>
                    <input type="file" wire:model="apkFile" accept=".apk,application/vnd.android.package-archive" @disabled(! $isEditable) class="block w-full text-sm text-gray-700 file:mr-4 file:rounded-xl file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100 dark:text-gray-200 dark:file:bg-primary-500/10 dark:file:text-primary-200">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Maksimal 256 MB. Upload baru akan mengganti APK yang dikelola server.</p>
                    <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-gray-400">
                        @if ($uploadedFileName)
                            <p>File saat ini: {{ $uploadedFileName }}</p>
                        @endif
                        @if ($apkFile)
                            <p>File terpilih: {{ method_exists($apkFile, 'getClientOriginalName') ? $apkFile->getClientOriginalName() : 'APK baru' }}</p>
                        @endif
                    </div>
                    <div wire:loading wire:target="apkFile" class="text-sm text-primary-600 dark:text-primary-300">Mengunggah APK sementara...</div>
                    @error('apkFile')
                        <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                    @enderror
                </label>

                <div class="grid gap-4 md:grid-cols-2">
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Checksum SHA256</span>
                        <input type="text" wire:model.blur="checksumSha256" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @error('checksumSha256')
                            <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                        @enderror
                    </label>
                    <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span>Ukuran file (bytes)</span>
                        <input type="number" min="1" wire:model.blur="fileSizeBytes" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white">
                        @error('fileSizeBytes')
                            <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                        @enderror
                    </label>
                </div>

                <label class="space-y-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span>Catatan rilis</span>
                    <textarea wire:model.blur="releaseNotesText" rows="8" @disabled(! $isEditable) class="w-full rounded-xl border-gray-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-gray-950 dark:text-white"></textarea>
                    @error('releaseNotesText')
                        <p class="text-sm text-danger-600 dark:text-danger-400">{{ $message }}</p>
                    @enderror
                </label>

                <div class="flex flex-wrap gap-3">
                    @if ($isEditable)
                        <button type="submit" class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50" wire:loading.attr="disabled" wire:target="saveRelease,apkFile">Simpan Release</button>
                    @endif
                    <a href="{{ route('mobile.latest') }}" target="_blank" rel="noopener" class="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5">Buka Halaman Publik</a>
                </div>
            </form>
        </section>
    </div>
</x-filament-panels::page>
