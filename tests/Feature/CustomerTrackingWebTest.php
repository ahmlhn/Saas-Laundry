<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Outlet;
use App\Models\Plan;
use App\Models\Service;
use App\Models\Tenant;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerTrackingWebTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outlet;

    private Customer $customer;

    private Order $order;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();

        $this->seed(RolesAndPlansSeeder::class);

        $standard = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant Tracking',
            'current_plan_id' => $standard->id,
            'status' => 'active',
        ]);

        $this->outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet Tracking',
            'code' => 'TRK',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. Tracking No. 1',
        ]);

        $this->customer = Customer::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Pelanggan Tracking',
            'phone_normalized' => '628111111111',
            'notes' => 'prefers express',
        ]);

        $service = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan Tracking',
            'unit_type' => 'kg',
            'base_price_amount' => 8000,
            'active' => true,
        ]);

        $this->order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'outlet_id' => $this->outlet->id,
            'customer_id' => $this->customer->id,
            'invoice_no' => 'INV-TRACK-001',
            'order_code' => 'ORD-TRACK-001',
            'is_pickup_delivery' => true,
            'laundry_status' => 'ironing',
            'courier_status' => 'at_outlet',
            'shipping_fee_amount' => 7000,
            'discount_amount' => 1000,
            'total_amount' => 30000,
            'paid_amount' => 12000,
            'due_amount' => 18000,
            'pickup' => [
                'address' => 'Jl. Pickup Tracking',
                'scheduled_at' => now()->toIso8601String(),
            ],
            'delivery' => [
                'address' => 'Jl. Delivery Tracking',
                'scheduled_at' => now()->addDay()->toIso8601String(),
            ],
            'notes' => 'Mohon selesai sore.',
            'source_channel' => 'mobile',
        ]);

        OrderItem::query()->create([
            'order_id' => $this->order->id,
            'service_id' => $service->id,
            'service_name_snapshot' => 'Kiloan Tracking',
            'unit_type_snapshot' => 'kg',
            'qty' => 1,
            'weight_kg' => 3,
            'unit_price_amount' => 8000,
            'subtotal_amount' => 24000,
        ]);
    }

    public function test_public_customer_tracking_page_is_accessible_without_auth(): void
    {
        $this->order->refresh();

        $this->assertNotEmpty($this->order->tracking_token);

        $this->get(route('customer.track', ['token' => $this->order->tracking_token]))
            ->assertOk()
            ->assertSeeText('Lacak Pesanan')
            ->assertSeeText('INV-TRACK-001')
            ->assertSeeText('Pelanggan Tracking')
            ->assertSeeText('disetrika')
            ->assertSeeText('Jl. Tracking No. 1')
            ->assertSeeText('Kiloan Tracking');
    }

    public function test_invalid_tracking_token_returns_not_found(): void
    {
        $this->get('/pelanggan/track/tidak-ada-token')
            ->assertNotFound();
    }
}
