<?php

namespace App\Domain\Platform;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Models\MobileReleaseSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PlatformMobileReleaseService
{
    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    /**
     * @param  array{
     *     version: string,
     *     build: int,
     *     download_url?: ?string,
     *     apk_file?: ?UploadedFile,
     *     minimum_supported_version?: ?string,
     *     published_at?: ?string,
     *     checksum_sha256?: ?string,
     *     file_size_bytes?: ?int,
     *     release_notes?: ?string
     * }  $payload
     */
    public function updateAndroidRelease(User $user, array $payload, ?Request $request = null): MobileReleaseSetting
    {
        $this->ensurePlatformOwner($user);

        $releaseNotes = preg_split('/\r\n|\r|\n/', trim((string) ($payload['release_notes'] ?? ''))) ?: [];
        $releaseNotes = array_values(array_filter(array_map(
            static fn (string $item): string => trim($item),
            $releaseNotes
        ), static fn (string $item): bool => $item !== ''));

        $setting = MobileReleaseSetting::query()->firstOrNew(['platform' => 'android']);
        $downloadUrl = $this->nullableTrimmedString($payload['download_url'] ?? null);
        $uploadedApk = $payload['apk_file'] ?? null;

        if ($uploadedApk instanceof UploadedFile) {
            $newUploadedPath = $this->storeUploadedApk(
                $uploadedApk,
                trim((string) $payload['version']),
                (int) $payload['build']
            );

            $this->deleteManagedUploadIfPresent($setting);

            $setting->uploaded_file_disk = 'public';
            $setting->uploaded_file_path = $newUploadedPath;
            $setting->uploaded_original_name = $uploadedApk->getClientOriginalName();
            $downloadUrl = $this->normalizePublicUrl(
                (string) Storage::disk('public')->url($newUploadedPath),
                $request
            );
        } else {
            $currentManagedUrl = $this->resolveManagedUploadUrl($setting, $request);

            if ($currentManagedUrl !== null && $downloadUrl !== $currentManagedUrl) {
                $this->deleteManagedUploadIfPresent($setting);
                $setting->uploaded_file_disk = null;
                $setting->uploaded_file_path = null;
                $setting->uploaded_original_name = null;
            }
        }

        $setting->fill([
            'version' => trim((string) $payload['version']),
            'build' => (int) $payload['build'],
            'download_url' => $downloadUrl,
            'minimum_supported_version' => $this->nullableTrimmedString($payload['minimum_supported_version'] ?? null),
            'published_at' => $this->nullableTrimmedString($payload['published_at'] ?? null),
            'checksum_sha256' => $this->nullableTrimmedString($payload['checksum_sha256'] ?? null),
            'file_size_bytes' => isset($payload['file_size_bytes']) ? (int) $payload['file_size_bytes'] : null,
            'release_notes' => $releaseNotes,
        ]);
        $setting->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_MOBILE_RELEASE_UPDATED,
            actor: $user,
            tenantId: null,
            entityType: 'mobile_release',
            entityId: $setting->id,
            metadata: [
                'platform' => 'android',
                'version' => $setting->version,
                'build' => $setting->build,
                'minimum_supported_version' => $setting->minimum_supported_version,
                'managed_upload' => filled($setting->uploaded_file_path),
            ],
            channel: 'web',
            request: $request,
        );

        return $setting->fresh() ?? $setting;
    }

    private function ensurePlatformOwner(User $user): void
    {
        if ($user->tenant_id !== null || ! $user->hasRole('platform_owner')) {
            abort(403, 'Only platform_owner can update mobile releases.');
        }
    }

    private function nullableTrimmedString(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : null;
    }

    private function storeUploadedApk(UploadedFile $file, string $version, int $build): string
    {
        $safeVersion = Str::slug($version, '-');
        $directory = 'mobile-releases/android';
        $filename = sprintf(
            '%s-%s-b%d-%s.apk',
            now()->format('YmdHis'),
            $safeVersion !== '' ? $safeVersion : 'release',
            $build,
            Str::lower(Str::random(8))
        );

        return $file->storeAs($directory, $filename, 'public');
    }

    private function deleteManagedUploadIfPresent(MobileReleaseSetting $setting): void
    {
        $disk = $setting->uploaded_file_disk ?: 'public';

        if ($setting->uploaded_file_path) {
            Storage::disk($disk)->delete($setting->uploaded_file_path);
        }
    }

    private function resolveManagedUploadUrl(MobileReleaseSetting $setting, ?Request $request = null): ?string
    {
        $disk = $setting->uploaded_file_disk ?: 'public';

        if (! $setting->uploaded_file_path) {
            return null;
        }

        return $this->normalizePublicUrl(
            (string) Storage::disk($disk)->url($setting->uploaded_file_path),
            $request
        );
    }

    private function normalizePublicUrl(string $url, ?Request $request = null): string
    {
        $normalized = trim($url);

        if ($normalized === '') {
            return $normalized;
        }

        if (Str::startsWith($normalized, ['http://', 'https://'])) {
            return $normalized;
        }

        $request ??= request();

        if (! $request instanceof Request) {
            return $normalized;
        }

        $base = rtrim($request->getSchemeAndHttpHost(), '/');

        if (Str::startsWith($normalized, '//')) {
            return $request->getScheme().':'.$normalized;
        }

        if (Str::startsWith($normalized, '/')) {
            return $base.$normalized;
        }

        return $base.'/'.ltrim($normalized, '/');
    }
}
