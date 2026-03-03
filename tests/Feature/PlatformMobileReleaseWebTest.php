<?php

namespace Tests\Feature;

use App\Models\MobileReleaseSetting;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PlatformMobileReleaseWebTest extends TestCase
{
    use RefreshDatabase;

    private User $platformOwner;

    private User $platformBilling;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        Storage::fake('public');
        $this->seed(RolesAndPlansSeeder::class);

        $this->platformOwner = $this->createPlatformUser('platform.owner@mobile.test', 'platform_owner');
        $this->platformBilling = $this->createPlatformUser('platform.billing@mobile.test', 'platform_billing');
    }

    public function test_platform_owner_can_open_mobile_release_page(): void
    {
        $this->actingAs($this->platformOwner, 'web')
            ->get('/platform/mobile-release')
            ->assertOk()
            ->assertSeeText('Release Android')
            ->assertSeeText('Simpan Release');
    }

    public function test_platform_owner_can_update_android_mobile_release_settings(): void
    {
        $this->actingAs($this->platformOwner, 'web')
            ->post('/platform/mobile-release', [
                'version' => '1.4.0',
                'build' => '14',
                'download_url' => 'https://downloads.example.com/cuci-1.4.0.apk',
                'minimum_supported_version' => '1.3.0',
                'published_at' => '2026-03-03 10:15:00',
                'checksum_sha256' => str_repeat('a', 64),
                'file_size_bytes' => '18432000',
                'release_notes' => "Perbaikan startup\nOptimasi customer list",
            ])
            ->assertRedirect(route('platform.mobile-release.edit'));

        $this->assertDatabaseHas('mobile_release_settings', [
            'platform' => 'android',
            'version' => '1.4.0',
            'build' => 14,
            'download_url' => 'https://downloads.example.com/cuci-1.4.0.apk',
            'minimum_supported_version' => '1.3.0',
            'checksum_sha256' => str_repeat('a', 64),
            'file_size_bytes' => 18432000,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => null,
            'user_id' => $this->platformOwner->id,
            'event_key' => 'PLATFORM_MOBILE_RELEASE_UPDATED',
            'channel' => 'web',
            'entity_type' => 'mobile_release',
        ]);
    }

    public function test_platform_owner_can_upload_apk_and_download_url_is_generated_automatically(): void
    {
        $this->actingAs($this->platformOwner, 'web')
            ->post('/platform/mobile-release', [
                'version' => '1.5.0',
                'build' => '15',
                'apk_file' => UploadedFile::fake()->create('cuci-1.5.0.apk', 20480, 'application/vnd.android.package-archive'),
                'release_notes' => "Upload APK otomatis",
            ])
            ->assertRedirect(route('platform.mobile-release.edit'));

        $setting = MobileReleaseSetting::query()->where('platform', 'android')->firstOrFail();

        $this->assertNotNull($setting->uploaded_file_path);
        $this->assertSame('public', $setting->uploaded_file_disk);
        $this->assertSame('cuci-1.5.0.apk', $setting->uploaded_original_name);
        $this->assertStringContainsString('/storage/mobile-releases/android/', (string) $setting->download_url);

        Storage::disk('public')->assertExists($setting->uploaded_file_path);
    }

    public function test_platform_billing_can_view_but_cannot_update_mobile_release_settings(): void
    {
        $this->actingAs($this->platformBilling, 'web')
            ->get('/platform/mobile-release')
            ->assertOk()
            ->assertDontSeeText('Simpan Release');

        $this->actingAs($this->platformBilling, 'web')
            ->post('/platform/mobile-release', [
                'version' => '1.4.0',
                'build' => '14',
            ])
            ->assertForbidden();
    }

    private function createPlatformUser(string $email, string $roleKey): User
    {
        $role = Role::query()->where('key', $roleKey)->firstOrFail();

        $user = User::factory()->create([
            'tenant_id' => null,
            'email' => $email,
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user;
    }
}
