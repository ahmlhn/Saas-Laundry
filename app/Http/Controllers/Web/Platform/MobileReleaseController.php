<?php

namespace App\Http\Controllers\Web\Platform;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Mobile\MobileReleaseCatalog;
use App\Http\Controllers\Controller;
use App\Models\MobileReleaseSetting;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\View\View;

class MobileReleaseController extends Controller
{
    public function __construct(
        private readonly AuditTrailService $auditTrail,
        private readonly MobileReleaseCatalog $catalog,
    ) {
    }

    public function edit(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        $setting = MobileReleaseSetting::query()
            ->where('platform', 'android')
            ->first();

        $release = $this->catalog->android();

        return view('web.platform.mobile-release.edit', [
            'user' => $user,
            'setting' => $setting,
            'release' => $release,
            'isEditable' => $user->hasRole('platform_owner'),
            'releaseNotesText' => implode(PHP_EOL, $release['notes']),
            'publishedAtInput' => $setting?->published_at?->format('Y-m-d\TH:i'),
            'uploadedFileName' => $setting?->uploaded_original_name,
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->hasRole('platform_owner')) {
            abort(403, 'Only platform_owner can update mobile releases.');
        }

        $validated = $request->validate([
            'version' => ['required', 'string', 'max:32'],
            'build' => ['required', 'integer', 'min:1', 'max:2147483647'],
            'download_url' => ['nullable', 'url', 'max:2048'],
            'apk_file' => ['nullable', 'file', 'mimes:apk', 'max:262144'],
            'minimum_supported_version' => ['nullable', 'string', 'max:32'],
            'published_at' => ['nullable', 'date'],
            'checksum_sha256' => ['nullable', 'string', 'size:64', 'regex:/^[a-fA-F0-9]+$/'],
            'file_size_bytes' => ['nullable', 'integer', 'min:1'],
            'release_notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $releaseNotes = preg_split('/\r\n|\r|\n/', trim((string) ($validated['release_notes'] ?? ''))) ?: [];
        $releaseNotes = array_values(array_filter(array_map(
            static fn (string $item): string => trim($item),
            $releaseNotes
        ), static fn (string $item): bool => $item !== ''));

        $setting = MobileReleaseSetting::query()->firstOrNew(['platform' => 'android']);
        $downloadUrl = $this->nullableTrimmedString($validated['download_url'] ?? null);
        $uploadedApk = $validated['apk_file'] ?? null;

        if ($uploadedApk instanceof UploadedFile) {
            $newUploadedPath = $this->storeUploadedApk(
                $uploadedApk,
                trim((string) $validated['version']),
                (int) $validated['build']
            );

            $this->deleteManagedUploadIfPresent($setting);

            $setting->uploaded_file_disk = 'public';
            $setting->uploaded_file_path = $newUploadedPath;
            $setting->uploaded_original_name = $uploadedApk->getClientOriginalName();
            $downloadUrl = Storage::disk('public')->url($newUploadedPath);
        } else {
            $currentManagedUrl = $this->resolveManagedUploadUrl($setting);

            if ($currentManagedUrl !== null && $downloadUrl !== $currentManagedUrl) {
                $this->deleteManagedUploadIfPresent($setting);
                $setting->uploaded_file_disk = null;
                $setting->uploaded_file_path = null;
                $setting->uploaded_original_name = null;
            }
        }

        $setting->fill([
            'version' => trim((string) $validated['version']),
            'build' => (int) $validated['build'],
            'download_url' => $downloadUrl,
            'minimum_supported_version' => $this->nullableTrimmedString($validated['minimum_supported_version'] ?? null),
            'published_at' => $this->nullableTrimmedString($validated['published_at'] ?? null),
            'checksum_sha256' => $this->nullableTrimmedString($validated['checksum_sha256'] ?? null),
            'file_size_bytes' => isset($validated['file_size_bytes']) ? (int) $validated['file_size_bytes'] : null,
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

        return redirect()
            ->route('platform.mobile-release.edit')
            ->with('status', 'Release mobile Android berhasil diperbarui.');
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

    private function resolveManagedUploadUrl(MobileReleaseSetting $setting): ?string
    {
        $disk = $setting->uploaded_file_disk ?: 'public';

        if (! $setting->uploaded_file_path) {
            return null;
        }

        return Storage::disk($disk)->url($setting->uploaded_file_path);
    }
}
