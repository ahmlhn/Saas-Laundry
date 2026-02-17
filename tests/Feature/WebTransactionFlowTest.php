<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\Outlet;
use App\Models\Plan;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WebTransactionFlowTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenantA;

    private Tenant $tenantB;

    private Outlet $outletA;

    private Outlet $outletB;

    private Service $serviceA;

    private User $adminA;

    private User $courierA;

    private Customer $customerA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();

        $this->seed(RolesAndPlansSeeder::class);

        $standard = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenantA = Tenant::query()->create([
            'name' => 'Tenant Web Flow A',
            'current_plan_id' => $standard->id,
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::query()->create([
            'name' => 'Tenant Web Flow B',
            'current_plan_id' => $standard->id,
            'status' => 'active',
        ]);

        $this->outletA = Outlet::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Outlet Flow A1',
            'code' => 'FA1',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. Flow A1',
        ]);

        $this->outletB = Outlet::query()->create([
            'tenant_id' => $this->tenantB->id,
            'name' => 'Outlet Flow B1',
            'code' => 'FB1',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. Flow B1',
        ]);

        $this->serviceA = Service::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Cuci Kiloan',
            'unit_type' => 'kg',
            'base_price_amount' => 9000,
            'active' => true,
        ]);

        $this->customerA = Customer::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Customer Flow',
            'phone_normalized' => '628123450001',
            'notes' => null,
        ]);

        $this->adminA = $this->createUserWithRole(
            email: 'admin.flow@panel.local',
            roleKey: 'admin',
            tenant: $this->tenantA,
            outlet: $this->outletA,
        );

        $this->courierA = $this->createUserWithRole(
            email: 'courier.flow@panel.local',
            roleKey: 'courier',
            tenant: $this->tenantA,
            outlet: $this->outletA,
        );
    }

    public function test_web_transaction_flow_create_pay_assign_and_complete_operational_statuses(): void
    {
        $tenant = $this->tenantA->id;

        $createResponse = $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$tenant.'/orders', [
                'outlet_id' => $this->outletA->id,
                'order_code' => 'ORD-WEB-FLOW-001',
                'is_pickup_delivery' => '1',
                'customer' => [
                    'name' => 'Customer Flow',
                    'phone' => '0812-3450-0001',
                ],
                'items' => [
                    [
                        'service_id' => $this->serviceA->id,
                        'weight_kg' => 2,
                    ],
                ],
            ]);

        $order = Order::query()
            ->where('tenant_id', $tenant)
            ->where('order_code', 'ORD-WEB-FLOW-001')
            ->firstOrFail();

        $createResponse->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$tenant.'/orders/'.$order->id.'/payments', [
                'method' => 'cash',
                'quick_action' => 'full',
            ])
            ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        foreach (['washing', 'drying', 'ironing', 'ready'] as $status) {
            $this->actingAs($this->adminA, 'web')
                ->post('/t/'.$tenant.'/orders/'.$order->id.'/status/laundry', [
                    'laundry_status' => $status,
                ])
                ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));
        }

        $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$tenant.'/orders/'.$order->id.'/assign-courier', [
                'courier_user_id' => $this->courierA->id,
            ])
            ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        foreach (['pickup_on_the_way', 'picked_up', 'at_outlet', 'delivery_pending', 'delivery_on_the_way', 'delivered'] as $status) {
            $this->actingAs($this->adminA, 'web')
                ->post('/t/'.$tenant.'/orders/'.$order->id.'/status/courier', [
                    'courier_status' => $status,
                ])
                ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));
        }

        $this->assertDatabaseHas('orders', [
            'id' => $order->id,
            'tenant_id' => $tenant,
            'laundry_status' => 'ready',
            'courier_status' => 'delivered',
            'courier_user_id' => $this->courierA->id,
            'paid_amount' => 18000,
            'due_amount' => 0,
            'source_channel' => 'web',
        ]);
    }

    public function test_web_transaction_flow_guard_blocks_invalid_transition_with_clear_reason(): void
    {
        $tenant = $this->tenantA->id;

        $createResponse = $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$tenant.'/orders', [
                'outlet_id' => $this->outletA->id,
                'order_code' => 'ORD-WEB-FLOW-INVALID-001',
                'is_pickup_delivery' => '1',
                'customer' => [
                    'name' => 'Customer Invalid',
                    'phone' => '0812-3450-0002',
                ],
                'items' => [
                    [
                        'service_id' => $this->serviceA->id,
                        'weight_kg' => 1,
                    ],
                ],
            ]);

        $order = Order::query()
            ->where('tenant_id', $tenant)
            ->where('order_code', 'ORD-WEB-FLOW-INVALID-001')
            ->firstOrFail();

        $createResponse->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        $this->actingAs($this->adminA, 'web')
            ->from('/t/'.$tenant.'/orders/'.$order->id)
            ->post('/t/'.$tenant.'/orders/'.$order->id.'/status/laundry', [
                'laundry_status' => 'completed',
            ])
            ->assertRedirect('/t/'.$tenant.'/orders/'.$order->id)
            ->assertSessionHasErrors('laundry_status');

        $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$tenant.'/orders/'.$order->id.'/status/laundry', [
                'laundry_status' => 'washing',
            ])
            ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        $this->actingAs($this->adminA, 'web')
            ->from('/t/'.$tenant.'/orders/'.$order->id)
            ->post('/t/'.$tenant.'/orders/'.$order->id.'/status/courier', [
                'courier_status' => 'delivery_pending',
            ])
            ->assertRedirect('/t/'.$tenant.'/orders/'.$order->id)
            ->assertSessionHasErrors('courier_status');
    }

    public function test_web_transaction_flow_scope_guard_blocks_cross_tenant_order_actions(): void
    {
        $foreignCustomer = Customer::query()->create([
            'tenant_id' => $this->tenantB->id,
            'name' => 'Customer Tenant B',
            'phone_normalized' => '628123450009',
            'notes' => null,
        ]);

        $foreignOrder = Order::query()->create([
            'tenant_id' => $this->tenantB->id,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $foreignCustomer->id,
            'order_code' => 'ORD-WEB-FLOW-B-001',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 12000,
            'paid_amount' => 0,
            'due_amount' => 12000,
        ]);

        $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$this->tenantA->id.'/orders/'.$foreignOrder->id.'/status/laundry', [
                'laundry_status' => 'washing',
            ])
            ->assertNotFound();

        $this->actingAs($this->adminA, 'web')
            ->post('/t/'.$this->tenantA->id.'/orders/'.$foreignOrder->id.'/assign-courier', [
                'courier_user_id' => $this->courierA->id,
            ])
            ->assertNotFound();
    }

    private function createUserWithRole(string $email, string $roleKey, Tenant $tenant, Outlet $outlet): User
    {
        $role = Role::query()->where('key', $roleKey)->firstOrFail();

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => $email,
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $user->roles()->syncWithoutDetaching([$role->id]);
        $user->outlets()->syncWithoutDetaching([$outlet->id]);

        return $user;
    }
}
