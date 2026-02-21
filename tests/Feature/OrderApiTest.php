<?php

namespace Tests\Feature;

use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Order;
use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OrderApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outlet;

    private Service $kgService;

    private User $admin;

    private User $cashier;

    private User $worker;

    private User $courier;

    private User $nonCourier;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $plan = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant EPIC02',
            'current_plan_id' => $plan->id,
            'status' => 'active',
        ]);

        $this->outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet A',
            'code' => 'OTA',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Alamat A',
        ]);

        $this->kgService = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan Reguler',
            'unit_type' => 'kg',
            'base_price_amount' => 8000,
            'active' => true,
        ]);

        OutletService::query()->create([
            'outlet_id' => $this->outlet->id,
            'service_id' => $this->kgService->id,
            'active' => true,
            'price_override_amount' => 9000,
        ]);

        $this->admin = $this->createUserWithRole('admin@epic02.local', 'admin');
        $this->cashier = $this->createUserWithRole('cashier@epic02.local', 'cashier');
        $this->worker = $this->createUserWithRole('worker@epic02.local', 'worker');
        $this->courier = $this->createUserWithRole('courier@epic02.local', 'courier');
        $this->nonCourier = $this->createUserWithRole('staff@epic02.local', 'cashier');
    }

    public function test_create_order_calculates_total_and_normalizes_customer_phone(): void
    {
        $response = $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-CORE01',
            'customer' => [
                'name' => 'Budi',
                'phone' => '0812 3456 7890',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 5.2,
                ],
            ],
            'shipping_fee_amount' => 10000,
            'discount_amount' => 2000,
            'is_pickup_delivery' => false,
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.total_amount', 54800)
            ->assertJsonPath('data.due_amount', 54800)
            ->assertJsonPath('data.customer.phone_normalized', '6281234567890');

        $this->assertDatabaseCount('customers', 1);
        $this->assertDatabaseHas('orders', [
            'tenant_id' => $this->tenant->id,
            'order_code' => 'ORD-CORE01',
            'created_by' => $this->cashier->id,
            'updated_by' => $this->cashier->id,
            'source_channel' => 'web',
        ]);
    }

    public function test_create_order_upserts_customer_by_phone_per_tenant(): void
    {
        $payload = [
            'outlet_id' => $this->outlet->id,
            'customer' => [
                'name' => 'Customer One',
                'phone' => '08111111111',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 2.0,
                ],
            ],
        ];

        $this->apiAs($this->cashier)->postJson('/api/orders', array_merge($payload, ['order_code' => 'ORD-UPS1']))->assertCreated();

        $this->apiAs($this->cashier)->postJson('/api/orders', array_merge($payload, [
            'order_code' => 'ORD-UPS2',
            'customer' => [
                'name' => 'Customer Updated',
                'phone' => '+62 8111111111',
            ],
        ]))->assertCreated();

        $this->assertDatabaseCount('customers', 1);
        $this->assertDatabaseHas('customers', [
            'tenant_id' => $this->tenant->id,
            'phone_normalized' => '628111111111',
            'name' => 'Customer Updated',
        ]);
    }

    public function test_create_order_rejects_when_quota_is_exceeded(): void
    {
        Plan::query()->whereKey($this->tenant->current_plan_id)->update([
            'orders_limit' => 1,
        ]);

        $payload = [
            'outlet_id' => $this->outlet->id,
            'customer' => [
                'name' => 'Quota Customer',
                'phone' => '081288881111',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 2.4,
                ],
            ],
        ];

        $this->apiAs($this->cashier)
            ->postJson('/api/orders', array_merge($payload, ['order_code' => 'ORD-QT-01']))
            ->assertCreated();

        $this->apiAs($this->cashier)
            ->postJson('/api/orders', array_merge($payload, ['order_code' => 'ORD-QT-02']))
            ->assertStatus(422)
            ->assertJsonPath('reason_code', 'QUOTA_EXCEEDED');

        $usage = QuotaUsage::query()
            ->where('tenant_id', $this->tenant->id)
            ->where('period', now()->format('Y-m'))
            ->first();

        $this->assertNotNull($usage);
        $this->assertSame(1, (int) $usage->orders_used);
    }

    public function test_add_payment_is_append_only_and_updates_due_amount(): void
    {
        $order = $this->createOrder('ORD-PAY01');

        $this->apiAs($this->cashier)->postJson("/api/orders/{$order->id}/payments", [
            'amount' => 20000,
            'method' => 'cash',
        ])->assertCreated();

        $this->apiAs($this->cashier)->postJson("/api/orders/{$order->id}/payments", [
            'amount' => 10000,
            'method' => 'qris',
        ])->assertCreated();

        $order = $order->fresh();

        $this->assertSame(30000, $order->paid_amount);
        $this->assertSame(max($order->total_amount - 30000, 0), $order->due_amount);
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseHas('payments', [
            'order_id' => $order->id,
            'method' => 'cash',
            'created_by' => $this->cashier->id,
            'updated_by' => $this->cashier->id,
            'source_channel' => 'web',
        ]);
    }

    public function test_laundry_status_is_forward_only_and_rejects_invalid_jump(): void
    {
        $order = $this->createOrder('ORD-LAUN01');

        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'washing',
        ])->assertOk();

        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'received',
        ])->assertStatus(422)->assertJsonPath('reason_code', 'STATUS_NOT_FORWARD');

        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'ready',
        ])->assertStatus(422)->assertJsonPath('reason_code', 'INVALID_TRANSITION');
    }

    public function test_assign_courier_requires_courier_role_and_status_rules(): void
    {
        $order = $this->createOrder('ORD-CRR01', true);

        $this->apiAs($this->admin)->postJson("/api/orders/{$order->id}/assign-courier", [
            'courier_user_id' => $this->courier->id,
        ])->assertOk()->assertJsonPath('data.courier_user_id', $this->courier->id);

        $this->apiAs($this->admin)->postJson("/api/orders/{$order->id}/assign-courier", [
            'courier_user_id' => $this->nonCourier->id,
        ])->assertStatus(422)->assertJsonPath('reason_code', 'VALIDATION_FAILED');

        $this->apiAs($this->courier)->postJson("/api/orders/{$order->id}/status/courier", [
            'status' => 'pickup_on_the_way',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$order->id}/status/courier", [
            'status' => 'picked_up',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$order->id}/status/courier", [
            'status' => 'at_outlet',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$order->id}/status/courier", [
            'status' => 'delivery_pending',
        ])->assertStatus(422)->assertJsonPath('reason_code', 'INVALID_TRANSITION');

        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'washing',
        ])->assertOk();
        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'drying',
        ])->assertOk();
        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'ironing',
        ])->assertOk();
        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'ready',
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$order->id}/status/courier", [
            'status' => 'delivery_pending',
        ])->assertOk();
    }

    public function test_cashier_can_edit_schedule_only_before_pickup_on_the_way(): void
    {
        $order = $this->createOrder('ORD-SCH01', true);

        $this->apiAs($this->cashier)->patchJson("/api/orders/{$order->id}/schedule", [
            'shipping_fee_amount' => 15000,
        ])->assertOk();

        $this->apiAs($this->courier)->postJson("/api/orders/{$order->id}/status/courier", [
            'status' => 'pickup_on_the_way',
        ])->assertOk();

        $this->apiAs($this->cashier)->patchJson("/api/orders/{$order->id}/schedule", [
            'shipping_fee_amount' => 17000,
        ])->assertStatus(422)->assertJsonPath('reason_code', 'SCHEDULE_LOCKED');
    }

    public function test_order_mutations_are_audited(): void
    {
        $order = $this->createOrder('ORD-AUD01');

        $this->apiAs($this->cashier)->postJson("/api/orders/{$order->id}/payments", [
            'amount' => 5000,
            'method' => 'cash',
        ])->assertCreated();

        $this->apiAs($this->worker)->postJson("/api/orders/{$order->id}/status/laundry", [
            'status' => 'washing',
        ])->assertOk();

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'event_key' => 'ORDER_CREATED',
            'entity_type' => 'order',
            'entity_id' => $order->id,
            'channel' => 'api',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'event_key' => 'PAYMENT_ADDED',
            'channel' => 'api',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenant->id,
            'event_key' => 'ORDER_LAUNDRY_STATUS_UPDATED',
            'entity_type' => 'order',
            'entity_id' => $order->id,
            'channel' => 'api',
        ]);
    }

    public function test_order_index_supports_search_query(): void
    {
        $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-SRC01',
            'customer' => [
                'name' => 'Andi Search',
                'phone' => '081200001111',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 2.4,
                ],
            ],
        ])->assertCreated();

        $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-SRC02',
            'customer' => [
                'name' => 'Budi Target',
                'phone' => '081200002222',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 1.6,
                ],
            ],
        ])->assertCreated();

        $this->apiAs($this->cashier)
            ->getJson('/api/orders?outlet_id='.$this->outlet->id.'&q=Target')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order_code', 'ORD-SRC02');

        $this->apiAs($this->cashier)
            ->getJson('/api/orders?outlet_id='.$this->outlet->id.'&q=081200002222')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order_code', 'ORD-SRC02');
    }

    private function createOrder(string $orderCode, bool $pickupDelivery = false): Order
    {
        $response = $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => $orderCode,
            'is_pickup_delivery' => $pickupDelivery,
            'customer' => [
                'name' => 'Customer Order',
                'phone' => '081299999999',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 3,
                ],
            ],
            'shipping_fee_amount' => 10000,
            'discount_amount' => 1000,
        ]);

        $response->assertCreated();

        return Order::query()->findOrFail($response->json('data.id'));
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
