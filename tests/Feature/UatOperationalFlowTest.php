<?php

namespace Tests\Feature;

use App\Domain\Audit\AuditEventKeys;
use App\Models\AuditEvent;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Plan;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WaMessage;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UatOperationalFlowTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outlet;

    private Service $service;

    private User $admin;

    private User $cashier;

    private User $worker;

    private User $courier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $premiumPlan = Plan::query()->where('key', 'premium')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant UAT',
            'current_plan_id' => $premiumPlan->id,
            'status' => 'active',
        ]);

        $this->outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet UAT',
            'code' => 'UAT1',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. UAT 1',
        ]);

        $this->service = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan UAT',
            'unit_type' => 'kg',
            'base_price_amount' => 10000,
            'active' => true,
        ]);

        OutletService::query()->create([
            'outlet_id' => $this->outlet->id,
            'service_id' => $this->service->id,
            'active' => true,
            'price_override_amount' => 11000,
        ]);

        $this->admin = $this->createUserWithRole('admin@uat.local', 'admin');
        $this->cashier = $this->createUserWithRole('cashier@uat.local', 'cashier');
        $this->worker = $this->createUserWithRole('worker@uat.local', 'worker');
        $this->courier = $this->createUserWithRole('courier@uat.local', 'courier');
    }

    public function test_operational_pickup_delivery_flow_runs_end_to_end(): void
    {
        $this->apiAs($this->admin)->postJson('/api/wa/provider-config', [
            'provider_key' => 'mock',
            'credentials' => [
                'token' => 'uat-token',
            ],
            'is_active' => true,
        ])->assertOk();

        $createOrderResponse = $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-UAT-001',
            'is_pickup_delivery' => true,
            'shipping_fee_amount' => 10000,
            'customer' => [
                'name' => 'Customer UAT',
                'phone' => '081234567890',
            ],
            'items' => [
                [
                    'service_id' => $this->service->id,
                    'weight_kg' => 3.5,
                ],
            ],
        ])->assertCreated();

        $orderId = (string) $createOrderResponse->json('data.id');

        $this->assertDatabaseHas('orders', [
            'id' => $orderId,
            'tenant_id' => $this->tenant->id,
            'laundry_status' => 'received',
            'courier_status' => 'pickup_pending',
        ]);

        $this->apiAs($this->admin)->postJson("/api/orders/{$orderId}/assign-courier", [
            'courier_user_id' => $this->courier->id,
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'pickup_on_the_way',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'picked_up',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'at_outlet',
        ])->assertOk();

        $this->apiAs($this->worker)->postJson("/api/orders/{$orderId}/status/laundry", [
            'status' => 'washing',
        ])->assertOk();

        $this->apiAs($this->worker)->postJson("/api/orders/{$orderId}/status/laundry", [
            'status' => 'drying',
        ])->assertOk();

        $this->apiAs($this->worker)->postJson("/api/orders/{$orderId}/status/laundry", [
            'status' => 'ironing',
        ])->assertOk();

        $this->apiAs($this->worker)->postJson("/api/orders/{$orderId}/status/laundry", [
            'status' => 'ready',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'delivery_pending',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'delivery_on_the_way',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$orderId}/status/courier", [
            'status' => 'delivered',
        ])->assertOk();

        $detailAfterDelivery = $this->apiAs($this->admin)
            ->getJson("/api/orders/{$orderId}")
            ->assertOk();

        $totalAmount = (int) $detailAfterDelivery->json('data.total_amount');
        $firstPaymentAmount = 20000;
        $secondPaymentAmount = max($totalAmount - $firstPaymentAmount, 1);

        $this->apiAs($this->cashier)->postJson("/api/orders/{$orderId}/payments", [
            'amount' => $firstPaymentAmount,
            'method' => 'cash',
        ])->assertCreated();

        $this->apiAs($this->cashier)->postJson("/api/orders/{$orderId}/payments", [
            'amount' => $secondPaymentAmount,
            'method' => 'qris',
        ])->assertCreated();

        $this->apiAs($this->admin)
            ->getJson("/api/orders/{$orderId}")
            ->assertOk()
            ->assertJsonPath('data.laundry_status', 'ready')
            ->assertJsonPath('data.courier_status', 'delivered')
            ->assertJsonPath('data.paid_amount', $firstPaymentAmount + $secondPaymentAmount)
            ->assertJsonPath('data.due_amount', 0);

        $expectedTemplates = [
            'WA_PICKUP_CONFIRM',
            'WA_PICKUP_OTW',
            'WA_LAUNDRY_READY',
            'WA_DELIVERY_OTW',
            'WA_ORDER_DONE',
        ];

        foreach ($expectedTemplates as $templateId) {
            $this->assertDatabaseHas('wa_messages', [
                'tenant_id' => $this->tenant->id,
                'outlet_id' => $this->outlet->id,
                'order_id' => $orderId,
                'template_id' => $templateId,
                'status' => 'sent',
            ]);
        }

        $this->assertSame(
            count($expectedTemplates),
            WaMessage::query()->where('order_id', $orderId)->count()
        );

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'event_key' => AuditEventKeys::ORDER_CREATED,
            'entity_id' => $orderId,
            'channel' => 'api',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'event_key' => AuditEventKeys::ORDER_COURIER_ASSIGNED,
            'entity_id' => $orderId,
            'channel' => 'api',
        ]);

        $this->assertSame(
            6,
            AuditEvent::query()
                ->where('tenant_id', $this->tenant->id)
                ->where('event_key', AuditEventKeys::ORDER_COURIER_STATUS_UPDATED)
                ->where('entity_id', $orderId)
                ->count()
        );

        $this->assertSame(
            4,
            AuditEvent::query()
                ->where('tenant_id', $this->tenant->id)
                ->where('event_key', AuditEventKeys::ORDER_LAUNDRY_STATUS_UPDATED)
                ->where('entity_id', $orderId)
                ->count()
        );

        $this->assertSame(
            2,
            AuditEvent::query()
                ->where('tenant_id', $this->tenant->id)
                ->where('event_key', AuditEventKeys::PAYMENT_ADDED)
                ->where('entity_type', 'payment')
                ->count()
        );
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
