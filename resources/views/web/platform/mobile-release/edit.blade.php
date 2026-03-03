@extends('web.platform.layouts.app', ['title' => 'Mobile Release'])

@section('content')
<section class="panel-section">
    <div class="section-head">
        <div>
            <h3>Release Android</h3>
            <p class="row-subtitle">Kelola metadata update aplikasi Android yang dipakai endpoint publik dan halaman unduhan server.</p>
        </div>
        <span class="status-badge status-info">Platform ANDROID</span>
    </div>

    <div class="stats-grid" style="margin-top: 16px;">
        <article class="stat-card">
            <p class="stat-label">Versi Publik</p>
            <p class="stat-value">{{ $release['version'] }}</p>
        </article>
        <article class="stat-card">
            <p class="stat-label">Build</p>
            <p class="stat-value">{{ $release['build'] }}</p>
        </article>
        <article class="stat-card">
            <p class="stat-label">Minimal Didukung</p>
            <p class="stat-value">{{ $release['minimum_supported_version'] ?? '-' }}</p>
        </article>
        <article class="stat-card">
            <p class="stat-label">Sumber Data</p>
            <p class="stat-value">{{ $setting ? 'DATABASE' : 'ENV FALLBACK' }}</p>
        </article>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Form Release</h3>
        @if($isEditable)
            <span class="status-badge status-success">Editable</span>
        @else
            <span class="status-badge status-warning">Read Only</span>
        @endif
    </div>

    <form method="POST" action="{{ route('platform.mobile-release.update') }}" class="stack-form" style="margin-top: 16px;" enctype="multipart/form-data">
        @csrf

        <div class="filters-grid">
            <div>
                <label for="version">Version</label>
                <input id="version" type="text" name="version" value="{{ old('version', $release['version']) }}" placeholder="1.0.0" @disabled(! $isEditable)>
            </div>
            <div>
                <label for="build">Build</label>
                <input id="build" type="number" min="1" name="build" value="{{ old('build', $release['build']) }}" placeholder="1" @disabled(! $isEditable)>
            </div>
            <div>
                <label for="minimum_supported_version">Minimum Supported Version</label>
                <input id="minimum_supported_version" type="text" name="minimum_supported_version" value="{{ old('minimum_supported_version', $release['minimum_supported_version']) }}" placeholder="1.0.0" @disabled(! $isEditable)>
            </div>
            <div>
                <label for="published_at">Published At</label>
                <input id="published_at" type="datetime-local" name="published_at" value="{{ old('published_at', $publishedAtInput) }}" @disabled(! $isEditable)>
            </div>
        </div>

        <div class="field-stack">
            <label for="download_url">Download URL APK</label>
            <input id="download_url" type="url" name="download_url" value="{{ old('download_url', $release['download_url']) }}" placeholder="https://saas.daratlaut.com/downloads/cuci-latest.apk" @disabled(! $isEditable)>
            <p class="row-subtitle">Boleh isi URL manual, atau upload APK di field bawah agar URL ini diisi otomatis oleh sistem.</p>
        </div>

        <div class="field-stack">
            <label for="apk_file">Upload APK Android</label>
            <input id="apk_file" type="file" name="apk_file" accept=".apk,application/vnd.android.package-archive" @disabled(! $isEditable)>
            <p class="row-subtitle">Maksimal 256 MB. Saat upload file baru, sistem akan mengganti APK upload sebelumnya dan memperbarui URL download otomatis.</p>
            @if($uploadedFileName)
                <p class="row-subtitle">File upload saat ini: {{ $uploadedFileName }}</p>
            @endif
        </div>

        <div class="filters-grid">
            <div>
                <label for="checksum_sha256">Checksum SHA256</label>
                <input id="checksum_sha256" type="text" name="checksum_sha256" value="{{ old('checksum_sha256', $release['checksum_sha256']) }}" placeholder="64 karakter hex" @disabled(! $isEditable)>
            </div>
            <div>
                <label for="file_size_bytes">Ukuran File (bytes)</label>
                <input id="file_size_bytes" type="number" min="1" name="file_size_bytes" value="{{ old('file_size_bytes', $release['file_size_bytes']) }}" placeholder="18432000" @disabled(! $isEditable)>
            </div>
        </div>

        <div class="field-stack">
            <label for="release_notes">Catatan Rilis</label>
            <textarea id="release_notes" name="release_notes" rows="8" placeholder="Satu baris untuk satu catatan rilis." @disabled(! $isEditable)>{{ old('release_notes', $releaseNotesText) }}</textarea>
        </div>

        <div class="filter-actions">
            @if($isEditable)
                <button class="btn btn-primary" type="submit">Simpan Release</button>
            @endif
            <a class="btn btn-muted" href="{{ route('mobile.latest') }}" target="_blank" rel="noopener">Buka Halaman Publik</a>
        </div>
    </form>
</section>
@endsection
