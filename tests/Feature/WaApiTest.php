<?php

namespace Tests\Feature;

use App\Jobs\SendWaMessageJob;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Plan;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WaMessage;
use App\Models\WaProvider;
use App\Models\WaProviderConfig;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WaApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outlet;

    private Service $service;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $standardPlan = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant WA',
            'current_plan_id' => $standardPlan->id,
            'status' => 'active',
        ]);

        $this->outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet WA',
            'code' => 'WAA',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. WA',
        ]);

        $this->service = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan',
            'unit_type' => 'kg',
            'base_price_amount' => 9000,
            'active' => true,
        ]);

        OutletService::query()->create([
            'outlet_id' => $this->outlet->id,
            'service_id' => $this->service->id,
            'active' => true,
            'price_override_amount' => 9500,
        ]);

        $this->admin = $this->createUserWithRole('admin@wa.local', 'admin');
    }

    public function test_wa_endpoints_are_plan_gated_for_standard_plan(): void
    {
        $this->apiAs($this->admin)
            ->getJson('/api/wa/providers')
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'PLAN_FEATURE_DISABLED');
    }

    public function test_premium_plan_can_configure_provider_and_read_templates(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mock',
            'credentials' => [
                'token' => 'demo-token',
            ],
            'is_active' => true,
        ])->assertOk()
            ->assertJsonPath('data.provider_key', 'mock')
            ->assertJsonPath('data.health.ok', true);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->admin->id,
            'event_key' => 'WA_PROVIDER_CONFIG_UPDATED',
            'channel' => 'api',
        ]);

        $this->apiAs($this->admin)
            ->getJson('/api/wa/providers')
            ->assertOk()
            ->assertJsonFragment([
                'key' => 'mock',
                'configured' => true,
                'is_active' => true,
            ]);

        $this->apiAs($this->admin)
            ->getJson('/api/wa/templates')
            ->assertOk()
            ->assertJsonFragment([
                'template_id' => 'WA_PICKUP_CONFIRM',
            ]);
    }

    public function test_premium_plan_can_configure_mpwa_provider(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mpwa',
            'credentials' => [
                'api_key' => 'mpwa-key',
                'sender' => '628123450001',
                'base_url' => 'https://mpwa.example.local',
                'send_path' => '/send-message',
            ],
            'is_active' => true,
        ])->assertOk()
            ->assertJsonPath('data.provider_key', 'mpwa')
            ->assertJsonPath('data.health.ok', true);
    }

    public function test_mpwa_sender_only_can_be_saved_before_full_credentials(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mpwa',
            'credentials' => [
                'sender' => '628123450777',
            ],
            'is_active' => true,
        ])->assertOk()
            ->assertJsonPath('data.provider_key', 'mpwa')
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.health.ok', false);

        $this->apiAs($this->admin)
            ->getJson('/api/wa/providers')
            ->assertOk()
            ->assertJsonFragment([
                'key' => 'mpwa',
                'configured' => true,
                'is_active' => false,
                'sender' => '628123450777',
            ]);
    }

    public function test_wa_providers_endpoint_returns_mpwa_sender_per_tenant(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mpwa',
            'credentials' => [
                'api_key' => 'mpwa-key',
                'sender' => '628123450002',
                'base_url' => 'https://mpwa.example.local',
            ],
            'is_active' => true,
        ])->assertOk();

        $response = $this->apiAs($this->admin)
            ->getJson('/api/wa/providers')
            ->assertOk();

        $mpwaRow = collect($response->json('data'))
            ->firstWhere('key', 'mpwa');

        $this->assertNotNull($mpwaRow);
        $this->assertSame('628123450002', $mpwaRow['sender'] ?? null);
    }

    public function test_upsert_provider_config_merges_credentials_when_updating_sender_only(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mpwa',
            'credentials' => [
                'api_key' => 'mpwa-key',
                'sender' => '628123450003',
                'base_url' => 'https://mpwa.example.local',
                'send_path' => '/send-message',
            ],
            'is_active' => true,
        ])->assertOk();

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mpwa',
            'credentials' => [
                'sender' => '628123450004',
            ],
            'is_active' => true,
        ])->assertOk();

        $providerId = WaProvider::query()->where('key', 'mpwa')->value('id');
        $this->assertNotNull($providerId);

        $config = WaProviderConfig::query()
            ->where('tenant_id', $this->tenant->id)
            ->where('provider_id', $providerId)
            ->first();

        $this->assertNotNull($config);
        $credentials = (array) ($config?->credentials_json ?? []);

        $this->assertSame('628123450004', $credentials['sender'] ?? null);
        $this->assertSame('mpwa-key', $credentials['api_key'] ?? null);
        $this->assertSame('https://mpwa.example.local', $credentials['base_url'] ?? null);
    }

    public function test_upsert_template_is_audited(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->putJson('/api/wa/templates/WA_ORDER_DONE', [
            'definition' => [
                'required_vars_all' => ['brand_name', 'customer_name', 'to_phone'],
                'required_vars_any' => [['invoice_no', 'order_code']],
                'body_lines' => [
                    ['text' => 'Halo {{customer_name}}, order selesai di {{brand_name}}.'],
                    ['text' => 'Invoice {{invoice_no}}', 'condition' => ['exists' => 'invoice_no']],
                    ['text' => 'Order {{order_code}}', 'condition' => ['notExists' => 'invoice_no']],
                ],
                'max_length' => 500,
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->admin->id,
            'event_key' => 'WA_TEMPLATE_UPDATED',
            'channel' => 'api',
        ]);
    }

    public function test_order_events_enqueue_wa_messages_for_premium_plan(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mock',
            'credentials' => [
                'token' => 'demo-token',
            ],
            'is_active' => true,
        ])->assertOk();

        $response = $this->apiAs($this->admin)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-WA-001',
            'is_pickup_delivery' => true,
            'customer' => [
                'name' => 'Pelanggan WA',
                'phone' => '081233331111',
            ],
            'items' => [
                [
                    'service_id' => $this->service->id,
                    'weight_kg' => 2,
                ],
            ],
        ])->assertCreated();

        $orderId = $response->json('data.id');

        $this->assertDatabaseHas('wa_messages', [
            'tenant_id' => $this->tenant->id,
            'order_id' => $orderId,
            'template_id' => 'WA_PICKUP_CONFIRM',
            'status' => 'sent',
            'created_by' => $this->admin->id,
            'source_channel' => 'system',
        ]);

        $this->apiAs($this->admin)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'pickup_on_the_way',
        ])->assertOk();

        $this->assertDatabaseHas('wa_messages', [
            'tenant_id' => $this->tenant->id,
            'order_id' => $orderId,
            'template_id' => 'WA_PICKUP_OTW',
            'status' => 'sent',
            'created_by' => $this->admin->id,
            'source_channel' => 'system',
        ]);

        $this->assertSame(2, WaMessage::query()->where('order_id', $orderId)->count());
    }

    public function test_non_pickup_order_creation_also_enqueues_wa_confirmation_message(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mock',
            'credentials' => [
                'token' => 'demo-token',
            ],
            'is_active' => true,
        ])->assertOk();

        $response = $this->apiAs($this->admin)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-WA-002',
            'is_pickup_delivery' => false,
            'customer' => [
                'name' => 'Pelanggan Non Pickup',
                'phone' => '081211110000',
            ],
            'items' => [
                [
                    'service_id' => $this->service->id,
                    'weight_kg' => 1.8,
                ],
            ],
        ])->assertCreated();

        $orderId = $response->json('data.id');

        $this->assertDatabaseHas('wa_messages', [
            'tenant_id' => $this->tenant->id,
            'order_id' => $orderId,
            'template_id' => 'WA_PICKUP_CONFIRM',
            'status' => 'sent',
            'created_by' => $this->admin->id,
            'source_channel' => 'system',
        ]);
    }

    public function test_send_job_retries_transient_failure_until_failed(): void
    {
        $this->setPlan('premium');

        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mock',
            'credentials' => [
                'token' => 'demo-token',
            ],
            'is_active' => true,
        ])->assertOk();

        $message = WaMessage::query()->create([
            'tenant_id' => $this->tenant->id,
            'outlet_id' => $this->outlet->id,
            'template_id' => 'WA_PICKUP_CONFIRM',
            'idempotency_key' => $this->tenant->id.':'.$this->outlet->id.':MANUAL:WA_PICKUP_CONFIRM',
            'to_phone' => '6281234567890',
            'body_text' => 'Pesan percobaan',
            'status' => 'queued',
            'attempts' => 0,
            'created_by' => $this->admin->id,
            'updated_by' => $this->admin->id,
            'source_channel' => 'web',
            'metadata_json' => [
                'mock_failure' => 'transient',
            ],
        ]);

        SendWaMessageJob::dispatchSync($message->id);

        $message = $message->fresh();

        $this->assertSame('failed', $message->status);
        $this->assertSame(5, (int) $message->attempts);
        $this->assertSame('NETWORK_ERROR', $message->last_error_code);
        $this->assertSame('system', $message->source_channel);
    }

    private function setPlan(string $planKey): void
    {
        $plan = Plan::query()->where('key', $planKey)->firstOrFail();

        $this->tenant->forceFill([
            'current_plan_id' => $plan->id,
        ])->save();
    }

    private function createUserWithRole(string $email, string $roleKey): User
    {
        $role = Role::query()->where('key', $roleKey)->firstOrFail();

        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => $email,
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $user->roles()->syncWithoutDetaching([$role->id]);
        $user->outlets()->syncWithoutDetaching([$this->outlet->id]);

        return $user;
    }

    private function apiAs(User $user): self
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user, 'sanctum');
    }
}
