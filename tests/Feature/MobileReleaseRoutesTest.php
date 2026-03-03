<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Config;
use Tests\TestCase;

class MobileReleaseRoutesTest extends TestCase
{
    public function test_android_release_api_returns_public_release_metadata(): void
    {
        Config::set('mobile_release.android', [
            'version' => '1.2.0',
            'build' => 12,
            'download_url' => 'https://downloads.example.com/cuci-1.2.0.apk',
            'minimum_supported_version' => '1.1.0',
            'published_at' => '2026-03-03T09:15:00+07:00',
            'checksum_sha256' => 'abc123',
            'file_size_bytes' => 18432000,
            'release_notes' => ['Perbaikan cache pelanggan', 'Optimasi daftar customer'],
        ]);

        $response = $this->getJson('/api/mobile/releases/android/latest');

        $response
            ->assertOk()
            ->assertJsonPath('data.platform', 'android')
            ->assertJsonPath('data.version', '1.2.0')
            ->assertJsonPath('data.build', 12)
            ->assertJsonPath('data.download_url', 'https://downloads.example.com/cuci-1.2.0.apk')
            ->assertJsonPath('data.minimum_supported_version', '1.1.0')
            ->assertJsonPath('data.published_at', '2026-03-03T09:15:00+07:00')
            ->assertJsonPath('data.checksum_sha256', 'abc123')
            ->assertJsonPath('data.file_size_bytes', 18432000)
            ->assertJsonPath('data.page_url', route('mobile.latest'))
            ->assertJsonPath('data.notes.0', 'Perbaikan cache pelanggan')
            ->assertJsonPath('data.notes.1', 'Optimasi daftar customer');
    }

    public function test_mobile_latest_page_renders_release_summary_and_download_link(): void
    {
        Config::set('mobile_release.android', [
            'version' => '1.2.0',
            'build' => 12,
            'download_url' => 'https://downloads.example.com/cuci-1.2.0.apk',
            'minimum_supported_version' => '1.1.0',
            'published_at' => '2026-03-03T09:15:00+07:00',
            'checksum_sha256' => 'abc123',
            'file_size_bytes' => 18432000,
            'release_notes' => ['Perbaikan cache pelanggan'],
        ]);

        $response = $this->get('/mobile/latest');

        $response
            ->assertOk()
            ->assertSeeText('Unduh versi terbaru aplikasi')
            ->assertSeeText('1.2.0')
            ->assertSeeText('Build')
            ->assertSeeText('Perbaikan cache pelanggan')
            ->assertSee('https://downloads.example.com/cuci-1.2.0.apk', false);
    }
}
