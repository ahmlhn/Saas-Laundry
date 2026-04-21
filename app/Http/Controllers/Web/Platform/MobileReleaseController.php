<?php

namespace App\Http\Controllers\Web\Platform;

use App\Domain\Platform\PlatformMobileReleaseService;
use App\Filament\Platform\Pages\PlatformMobileRelease;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class MobileReleaseController extends Controller
{
    public function __construct(
        private readonly PlatformMobileReleaseService $mobileReleaseService,
    ) {
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

        $this->mobileReleaseService->updateAndroidRelease(
            user: $user,
            payload: $validated,
            request: $request,
        );

        return redirect()
            ->to(PlatformMobileRelease::getUrl(panel: 'platform'))
            ->with('status', 'Release mobile Android berhasil diperbarui.');
    }
}
