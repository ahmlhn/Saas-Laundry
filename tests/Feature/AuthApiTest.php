<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Outlet;
use App\Models\Plan;
use App\Models\Promotion;
use App\Models\Role;
use App\Models\Service;
use App\Models\ServiceProcessTag;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $allowedOutlet;

    private Outlet $blockedOutlet;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $plan = Plan::query()->where('key', 'standard')->firstOrFail();
        $adminRole = Role::query()->where('key', 'admin')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant Test',
            'current_plan_id' => $plan->id,
            'status' => 'active',
        ]);

        $this->allowedOutlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet Allowed',
            'code' => 'ALW',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Address A',
        ]);

        $this->blockedOutlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet Blocked',
            'code' => 'BLK',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Address B',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'phone' => '6281234567890',
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $this->user->roles()->syncWithoutDetaching([$adminRole->id]);
        $this->user->outlets()->syncWithoutDetaching([$this->allowedOutlet->id]);
    }

    public function test_login_returns_token_and_context(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'password',
            'device_name' => 'test-device',
        ]);

        $response
            ->assertOk()
            ->assertHeader('X-Request-Id')
            ->assertJsonPath('data.user.email', 'admin@example.com')
            ->assertJsonPath('data.plan.key', 'standard');

        $this->assertNotEmpty($response->json('access_token'));

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'event_key' => 'AUTH_LOGIN_SUCCESS',
            'channel' => 'api',
        ]);
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/me')->assertUnauthorized();
    }

    public function test_login_accepts_phone_number_identifier(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'login' => '081234567890',
            'password' => 'password',
            'device_name' => 'test-device',
        ]);

        $response
            ->assertOk()
            ->assertHeader('X-Request-Id')
            ->assertJsonPath('data.user.email', 'admin@example.com')
            ->assertJsonPath('data.user.phone', '6281234567890');

        $this->assertNotEmpty($response->json('access_token'));
    }

    public function test_google_login_returns_token_for_registered_email(): void
    {
        config(['services.google.client_ids' => ['android-client-id']]);

        Http::fake([
            'https://oauth2.googleapis.com/tokeninfo*' => Http::response([
                'aud' => 'android-client-id',
                'sub' => 'google-sub-123',
                'email' => 'admin@example.com',
                'email_verified' => 'true',
            ], 200),
        ]);

        $response = $this->postJson('/api/auth/google', [
            'id_token' => 'mock-google-id-token',
            'device_name' => 'android-device',
        ]);

        $response
            ->assertOk()
            ->assertHeader('X-Request-Id')
            ->assertJsonPath('data.user.email', 'admin@example.com');

        $this->assertNotEmpty($response->json('access_token'));
    }

    public function test_google_login_rejects_unregistered_email(): void
    {
        config(['services.google.client_ids' => ['android-client-id']]);

        Http::fake([
            'https://oauth2.googleapis.com/tokeninfo*' => Http::response([
                'aud' => 'android-client-id',
                'sub' => 'google-sub-unknown',
                'email' => 'not.registered@example.com',
                'email_verified' => 'true',
            ], 200),
        ]);

        $this->postJson('/api/auth/google', [
            'id_token' => 'mock-google-id-token',
        ])->assertStatus(403)->assertJsonPath('reason_code', 'GOOGLE_ACCOUNT_NOT_REGISTERED');
    }

    public function test_register_creates_owner_tenant_and_returns_token(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Owner Baru',
            'tenant_name' => 'Laundry Baru',
            'outlet_name' => 'Outlet Pusat',
            'email' => 'owner.baru@example.com',
            'phone' => '081234567899',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'device_name' => 'register-device',
        ]);

        $response
            ->assertCreated()
            ->assertHeader('X-Request-Id')
            ->assertJsonPath('data.user.email', 'owner.baru@example.com')
            ->assertJsonPath('data.user.phone', '6281234567899')
            ->assertJsonPath('data.roles.0', 'owner');

        $this->assertNotEmpty($response->json('access_token'));

        $registeredUser = User::query()->where('email', 'owner.baru@example.com')->first();
        $this->assertNotNull($registeredUser);
        $this->assertNotNull($registeredUser->tenant_id);
        $this->assertSame('active', $registeredUser->status);
        $this->assertTrue($registeredUser->roles()->where('key', 'owner')->exists());
        $this->assertSame(1, $registeredUser->outlets()->count());

        $subscription = TenantSubscription::query()
            ->where('tenant_id', $registeredUser->tenant_id)
            ->where('period', now()->format('Y-m'))
            ->first();
        $this->assertNotNull($subscription);

        $this->assertGreaterThan(0, Service::query()->where('tenant_id', $registeredUser->tenant_id)->count());
        $this->assertGreaterThan(0, Service::query()->where('tenant_id', $registeredUser->tenant_id)->where('service_type', 'regular')->count());
        $this->assertGreaterThan(0, Service::query()->where('tenant_id', $registeredUser->tenant_id)->where('service_type', 'package')->count());
        $this->assertGreaterThan(0, Service::query()->where('tenant_id', $registeredUser->tenant_id)->where('service_type', 'perfume')->count());
        $this->assertGreaterThan(0, Service::query()->where('tenant_id', $registeredUser->tenant_id)->where('service_type', 'item')->count());

        $this->assertDatabaseHas('service_process_tags', [
            'tenant_id' => $registeredUser->tenant_id,
            'name' => 'Cuci',
        ]);

        $this->assertGreaterThan(0, ServiceProcessTag::query()->where('tenant_id', $registeredUser->tenant_id)->count());
        $this->assertGreaterThan(0, Promotion::query()->where('tenant_id', $registeredUser->tenant_id)->count());
    }

    public function test_forgot_password_creates_reset_token_with_generic_response(): void
    {
        $response = $this->postJson('/api/auth/password/forgot', [
            'login' => '081234567890',
        ]);

        $response
            ->assertOk()
            ->assertHeader('X-Request-Id')
            ->assertJsonPath('message', 'Jika akun ditemukan, kode reset sudah dikirim ke email terdaftar.');

        $tokenRow = DB::table('password_reset_tokens')
            ->where('email', 'admin@example.com')
            ->first();

        $this->assertNotNull($tokenRow);
        $this->assertIsString($tokenRow->token);
        $this->assertNotSame('', trim($tokenRow->token));
    }

    public function test_reset_password_updates_password_and_clears_token(): void
    {
        DB::table('password_reset_tokens')->insert([
            'email' => 'admin@example.com',
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $response = $this->postJson('/api/auth/password/reset', [
            'login' => 'admin@example.com',
            'code' => '123456',
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ]);

        $response
            ->assertOk()
            ->assertHeader('X-Request-Id')
            ->assertJsonPath('message', 'Password berhasil direset. Silakan login dengan password baru.');

        $this->assertTrue(Hash::check('new-password-123', (string) $this->user->fresh()->password));
        $this->assertDatabaseMissing('password_reset_tokens', [
            'email' => 'admin@example.com',
        ]);
    }

    public function test_outlet_scope_rejects_unassigned_outlet(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'password',
        ])->json('access_token');

        $this->withToken($token)
            ->getJson('/api/me?outlet_id='.$this->blockedOutlet->id)
            ->assertForbidden()
            ->assertJsonPath('reason_code', 'OUTLET_ACCESS_DENIED');
    }

    public function test_outlet_scope_allows_assigned_outlet(): void
    {
        $token = $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'password',
        ])->json('access_token');

        $this->withToken($token)
            ->getJson('/api/me?outlet_id='.$this->allowedOutlet->id)
            ->assertOk()
            ->assertJsonPath('data.user.email', 'admin@example.com');
    }

    public function test_login_rate_limit_blocks_excessive_attempts(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'throttle@example.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/auth/login', [
            'email' => 'throttle@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(429)->assertJsonPath('reason_code', 'TOO_MANY_REQUESTS');
    }

    public function test_failed_login_is_audited(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'admin@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(422);

        $event = AuditEvent::query()
            ->where('event_key', 'AUTH_LOGIN_FAILED')
            ->latest('created_at')
            ->first();

        $this->assertNotNull($event);
        $this->assertSame($this->tenant->id, $event->tenant_id);
        $this->assertSame($this->user->id, $event->user_id);
        $this->assertSame('api', $event->channel);
    }
}
