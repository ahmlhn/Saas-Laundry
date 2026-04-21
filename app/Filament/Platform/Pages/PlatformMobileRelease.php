<?php

namespace App\Filament\Platform\Pages;

use App\Domain\Mobile\MobileReleaseCatalog;
use App\Domain\Platform\PlatformMobileReleaseService;
use App\Filament\Platform\Support\PlatformPanelAccess;
use App\Models\MobileReleaseSetting;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Facades\Validator;
use Livewire\WithFileUploads;
use UnitEnum;

class PlatformMobileRelease extends Page
{
    use WithFileUploads;

    protected static ?string $slug = 'mobile-release';

    protected static ?string $navigationLabel = 'Mobile Release';

    protected static string|UnitEnum|null $navigationGroup = 'Platform';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedDevicePhoneMobile;

    protected static ?int $navigationSort = 20;

    protected string $view = 'filament.platform.pages.mobile-release';

    public array $release = [];

    public ?array $setting = null;

    public bool $isEditable = false;

    public string $releaseNotesText = '';

    public ?string $publishedAtInput = null;

    public ?string $uploadedFileName = null;

    public string $version = '';

    public string $build = '';

    public string $downloadUrl = '';

    public string $minimumSupportedVersion = '';

    public string $checksumSha256 = '';

    public string $fileSizeBytes = '';

    public mixed $apkFile = null;

    public static function canAccess(): bool
    {
        return PlatformPanelAccess::isPlatformUser();
    }

    public function mount(): void
    {
        abort_unless(static::canAccess(), 403);

        $this->loadReleaseData();
    }

    public function saveRelease(): void
    {
        abort_unless($this->isEditable, 403);

        $validated = Validator::make([
            'version' => trim($this->version),
            'build' => $this->normalizeNullableInput($this->build),
            'downloadUrl' => $this->normalizeNullableInput($this->downloadUrl),
            'apkFile' => $this->apkFile,
            'minimumSupportedVersion' => $this->normalizeNullableInput($this->minimumSupportedVersion),
            'publishedAtInput' => $this->normalizeNullableInput($this->publishedAtInput),
            'checksumSha256' => $this->normalizeNullableInput($this->checksumSha256),
            'fileSizeBytes' => $this->normalizeNullableInput($this->fileSizeBytes),
            'releaseNotesText' => $this->normalizeNullableInput($this->releaseNotesText),
        ], [
            'version' => ['required', 'string', 'max:32'],
            'build' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'downloadUrl' => ['nullable', 'url', 'max:2048'],
            'apkFile' => ['nullable', 'file', 'mimes:apk', 'max:262144'],
            'minimumSupportedVersion' => ['nullable', 'string', 'max:32'],
            'publishedAtInput' => ['nullable', 'date'],
            'checksumSha256' => ['nullable', 'string', 'size:64', 'regex:/^[a-fA-F0-9]+$/'],
            'fileSizeBytes' => ['nullable', 'integer', 'min:1'],
            'releaseNotesText' => ['nullable', 'string', 'max:5000'],
        ], [], [
            'downloadUrl' => 'download URL APK',
            'apkFile' => 'upload APK',
            'minimumSupportedVersion' => 'minimum supported version',
            'publishedAtInput' => 'published at',
            'checksumSha256' => 'checksum SHA256',
            'fileSizeBytes' => 'ukuran file',
            'releaseNotesText' => 'catatan rilis',
        ])->validate();

        $user = PlatformPanelAccess::user();
        abort_unless($user !== null, 403);

        app(PlatformMobileReleaseService::class)->updateAndroidRelease(
            user: $user,
            payload: [
                'version' => (string) $validated['version'],
                'build' => (int) $validated['build'],
                'download_url' => $validated['downloadUrl'] ?: null,
                'apk_file' => $validated['apkFile'] ?? null,
                'minimum_supported_version' => $validated['minimumSupportedVersion'] ?: null,
                'published_at' => $validated['publishedAtInput'] ?: null,
                'checksum_sha256' => $validated['checksumSha256'] ?: null,
                'file_size_bytes' => $validated['fileSizeBytes'] !== '' ? (int) $validated['fileSizeBytes'] : null,
                'release_notes' => $validated['releaseNotesText'] ?: null,
            ],
            request: request(),
        );

        $this->apkFile = null;
        $this->loadReleaseData();

        Notification::make()
            ->title('Release mobile Android berhasil diperbarui.')
            ->success()
            ->send();
    }

    public function getTitle(): string
    {
        return 'Mobile Release';
    }

    private function loadReleaseData(): void
    {
        $setting = MobileReleaseSetting::query()
            ->where('platform', 'android')
            ->first();

        $this->release = app(MobileReleaseCatalog::class)->android();
        $this->setting = $setting ? [
            'id' => (string) $setting->id,
            'platform' => (string) $setting->platform,
        ] : null;
        $this->isEditable = PlatformPanelAccess::isPlatformOwner();
        $this->releaseNotesText = implode(PHP_EOL, $this->release['notes']);
        $this->publishedAtInput = $setting?->published_at?->format('Y-m-d\TH:i');
        $this->uploadedFileName = $setting?->uploaded_original_name;
        $this->version = (string) ($this->release['version'] ?? '');
        $this->build = (string) ($this->release['build'] ?? '');
        $this->downloadUrl = (string) ($this->release['download_url'] ?? '');
        $this->minimumSupportedVersion = (string) ($this->release['minimum_supported_version'] ?? '');
        $this->checksumSha256 = (string) ($this->release['checksum_sha256'] ?? '');
        $this->fileSizeBytes = $this->release['file_size_bytes'] !== null
            ? (string) $this->release['file_size_bytes']
            : '';
    }

    private function normalizeNullableInput(mixed $value): mixed
    {
        if (! is_string($value)) {
            return $value;
        }

        $normalized = trim($value);

        return $normalized !== '' ? $normalized : null;
    }
}
