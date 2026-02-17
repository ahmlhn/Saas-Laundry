<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Role;
use App\Models\Service;
use App\Models\ShippingZone;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WebPanelTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenantA;

    private Tenant $tenantB;

    private Outlet $outletA;

    private Outlet $outletB;

    private User $owner;

    private User $admin;

    private User $cashier;

    private User $courier;

    private Customer $customer;

    private Service $service;

    private Order $orderA;

    private Order $courierOrderReady;

    private Order $courierOrderBlocked;

    private Order $walkInOrder;

    private string $foreignOrderId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();

        $this->seed(RolesAndPlansSeeder::class);

        $standard = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenantA = Tenant::query()->create([
            'name' => 'Tenant Panel A',
            'current_plan_id' => $standard->id,
            'status' => 'active',
        ]);

        $this->tenantB = Tenant::query()->create([
            'name' => 'Tenant Panel B',
            'current_plan_id' => $standard->id,
            'status' => 'active',
        ]);

        $this->outletA = Outlet::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Outlet Panel A1',
            'code' => 'PA1',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. A1',
        ]);

        $this->outletB = Outlet::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Outlet Panel A2',
            'code' => 'PA2',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. A2',
        ]);

        $outletB1 = Outlet::query()->create([
            'tenant_id' => $this->tenantB->id,
            'name' => 'Outlet Panel B1',
            'code' => 'PB1',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. B1',
        ]);

        $this->customer = Customer::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Customer Panel',
            'phone_normalized' => '628111111111',
            'notes' => 'seed',
        ]);

        $this->service = Service::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Service Panel',
            'unit_type' => 'kg',
            'base_price_amount' => 9000,
            'active' => true,
        ]);

        $this->orderA = Order::query()->create([
            'tenant_id' => $this->tenantA->id,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-PANEL-001',
            'is_pickup_delivery' => true,
            'laundry_status' => 'ironing',
            'courier_status' => 'pickup_pending',
            'shipping_fee_amount' => 4000,
            'discount_amount' => 0,
            'total_amount' => 29000,
            'paid_amount' => 10000,
            'due_amount' => 19000,
        ]);

        $this->courierOrderReady = Order::query()->create([
            'tenant_id' => $this->tenantA->id,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-PANEL-DELIVERY-READY',
            'is_pickup_delivery' => true,
            'laundry_status' => 'ready',
            'courier_status' => 'at_outlet',
            'shipping_fee_amount' => 5000,
            'discount_amount' => 0,
            'total_amount' => 35000,
            'paid_amount' => 15000,
            'due_amount' => 20000,
        ]);

        $this->courierOrderBlocked = Order::query()->create([
            'tenant_id' => $this->tenantA->id,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-PANEL-DELIVERY-BLOCKED',
            'is_pickup_delivery' => true,
            'laundry_status' => 'ironing',
            'courier_status' => 'at_outlet',
            'shipping_fee_amount' => 5000,
            'discount_amount' => 0,
            'total_amount' => 35000,
            'paid_amount' => 15000,
            'due_amount' => 20000,
        ]);

        $this->walkInOrder = Order::query()->create([
            'tenant_id' => $this->tenantA->id,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-PANEL-WALKIN-001',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 18000,
            'paid_amount' => 0,
            'due_amount' => 18000,
        ]);

        $foreignCustomer = Customer::query()->create([
            'tenant_id' => $this->tenantB->id,
            'name' => 'Customer Foreign',
            'phone_normalized' => '628222222222',
            'notes' => null,
        ]);

        $foreignOrder = Order::query()->create([
            'tenant_id' => $this->tenantB->id,
            'outlet_id' => $outletB1->id,
            'customer_id' => $foreignCustomer->id,
            'order_code' => 'ORD-PANEL-B-001',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 12000,
            'paid_amount' => 0,
            'due_amount' => 12000,
        ]);

        $this->foreignOrderId = $foreignOrder->id;

        $this->owner = $this->createUserWithRole('owner@panel.local', 'owner', $this->tenantA, $this->outletA);
        $this->owner->outlets()->syncWithoutDetaching([$this->outletB->id]);
        $this->admin = $this->createUserWithRole('admin@panel.local', 'admin', $this->tenantA, $this->outletA);
        $this->cashier = $this->createUserWithRole('cashier@panel.local', 'cashier', $this->tenantA, $this->outletA);
        $this->courier = $this->createUserWithRole('courier@panel.local', 'courier', $this->tenantA, $this->outletA);
    }

    public function test_admin_can_login_and_open_web_panel_pages(): void
    {
        $login = $this->post('/t/'.$this->tenantA->id.'/login', [
            'email' => 'admin@panel.local',
            'password' => 'password',
        ]);

        $login->assertRedirect(route('tenant.dashboard', ['tenant' => $this->tenantA->id]));

        $this->followRedirects($login)
            ->assertOk()
            ->assertSeeText('Dasbor');

        $this->get('/t/'.$this->tenantA->id.'/orders')->assertOk()->assertSeeText('Papan Pesanan');
        $this->get('/t/'.$this->tenantA->id.'/orders/create')->assertOk()->assertSeeText('Buat Transaksi');
        $this->get('/t/'.$this->tenantA->id.'/orders/'.$this->orderA->id)->assertOk()->assertSeeText('Ringkasan Pesanan');
        $this->get('/t/'.$this->tenantA->id.'/users')->assertOk()->assertSeeText('Pengguna');
        $this->get('/t/'.$this->tenantA->id.'/customers')->assertOk()->assertSeeText('Pelanggan');
        $this->get('/t/'.$this->tenantA->id.'/services')->assertOk()->assertSeeText('Layanan');
        $this->get('/t/'.$this->tenantA->id.'/billing')->assertOk()->assertSeeText('Billing & Kuota');
        $this->get('/t/'.$this->tenantA->id.'/outlet-services')->assertOk()->assertSeeText('Layanan Outlet');
        $this->get('/t/'.$this->tenantA->id.'/outlets')->assertOk()->assertSeeText('Outlet');
        $this->get('/t/'.$this->tenantA->id.'/shipping-zones')->assertOk()->assertSeeText('Zona Pengantaran');

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $this->tenantA->id,
            'user_id' => $this->admin->id,
            'event_key' => 'AUTH_LOGIN_SUCCESS',
            'channel' => 'web',
        ]);
    }

    public function test_non_owner_admin_user_cannot_login_to_web_panel(): void
    {
        $this->post('/t/'.$this->tenantA->id.'/login', [
            'email' => 'cashier@panel.local',
            'password' => 'password',
        ])->assertStatus(403);
    }

    public function test_tenant_path_mismatch_is_forbidden(): void
    {
        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantB->id.'/dashboard')
            ->assertStatus(403);
    }

    public function test_wa_page_is_plan_gated(): void
    {
        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantA->id.'/wa')
            ->assertStatus(403);

        $premium = Plan::query()->where('key', 'premium')->firstOrFail();

        $this->tenantA->forceFill([
            'current_plan_id' => $premium->id,
        ])->save();

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantA->id.'/wa')
            ->assertOk()
            ->assertSeeText('Konfigurasi Provider');
    }

    public function test_order_detail_respects_tenant_scope(): void
    {
        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantA->id.'/orders/'.$this->foreignOrderId)
            ->assertNotFound();
    }

    public function test_admin_can_open_print_friendly_receipt_page(): void
    {
        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantA->id.'/orders/'.$this->orderA->id.'/receipt')
            ->assertOk()
            ->assertSeeText('Cetak Ringkas Transaksi')
            ->assertSeeText($this->orderA->order_code);
    }

    public function test_receipt_page_respects_tenant_scope(): void
    {
        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantA->id.'/orders/'.$this->foreignOrderId.'/receipt')
            ->assertNotFound();
    }

    public function test_order_detail_disables_invalid_status_options_based_on_current_pipeline_state(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/orders/'.$this->orderA->id)
            ->assertOk()
            ->assertSeeText('Selesai (tidak valid saat ini)')
            ->assertDontSeeText('Siap (tidak valid saat ini)');

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/orders/'.$this->courierOrderBlocked->id)
            ->assertOk()
            ->assertSeeText('Antar Tertunda (tidak valid saat ini)')
            ->assertDontSeeText('Di Outlet (tidak valid saat ini)');
    }

    public function test_admin_can_export_order_board_csv_with_filters_and_scope(): void
    {
        $tenant = $this->tenantA->id;

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-PANEL-SCOPE-B',
            'is_pickup_delivery' => false,
            'laundry_status' => 'ironing',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 15000,
            'paid_amount' => 0,
            'due_amount' => 15000,
        ]);

        $response = $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/orders/export?laundry_status=ironing');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('invoice_or_order_code', $content);
        $this->assertStringContainsString('ORD-PANEL-001', $content);
        $this->assertStringNotContainsString('ORD-PANEL-SCOPE-B', $content);
    }

    public function test_owner_export_order_board_csv_includes_all_outlets_in_tenant_scope(): void
    {
        $tenant = $this->tenantA->id;

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-PANEL-OWNER-B',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 12000,
            'paid_amount' => 0,
            'due_amount' => 12000,
        ]);

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/orders/export?laundry_status=received');

        $response->assertOk();

        $content = $response->streamedContent();

        $this->assertStringContainsString('ORD-PANEL-WALKIN-001', $content);
        $this->assertStringContainsString('ORD-PANEL-OWNER-B', $content);
    }

    public function test_billing_page_shows_quota_and_scope_summary_for_admin_and_owner(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        QuotaUsage::query()->create([
            'tenant_id' => $tenant,
            'period' => $period,
            'orders_used' => 8,
        ]);

        $currentPlan = Plan::query()->where('key', 'standard')->firstOrFail();

        TenantSubscription::query()->create([
            'tenant_id' => $tenant,
            'plan_id' => $currentPlan->id,
            'period' => $period,
            'starts_at' => now()->startOfMonth(),
            'ends_at' => now()->endOfMonth(),
            'status' => 'active',
        ]);

        $scopedOrder = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-SCOPE-A',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 21000,
            'paid_amount' => 10000,
            'due_amount' => 11000,
        ]);

        $nonScopedOrder = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-SCOPE-B',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 34000,
            'paid_amount' => 0,
            'due_amount' => 34000,
        ]);

        Payment::query()->create([
            'order_id' => $scopedOrder->id,
            'amount' => 10000,
            'method' => 'cash',
            'paid_at' => now(),
            'notes' => 'scope A',
            'created_by' => $this->admin->id,
            'updated_by' => $this->admin->id,
            'source_channel' => 'web',
        ]);

        Payment::query()->create([
            'order_id' => $nonScopedOrder->id,
            'amount' => 5000,
            'method' => 'cash',
            'paid_at' => now(),
            'notes' => 'scope B',
            'created_by' => $this->owner->id,
            'updated_by' => $this->owner->id,
            'source_channel' => 'web',
        ]);

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period)
            ->assertOk()
            ->assertSeeText('Billing & Kuota')
            ->assertSeeText('Outlet Panel A1')
            ->assertDontSeeText('Outlet Panel A2')
            ->assertViewHas('quota', fn (array $quota): bool => $quota['period'] === $period && $quota['orders_used'] === 8);

        $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period)
            ->assertOk()
            ->assertSeeText('Outlet Panel A1')
            ->assertSeeText('Outlet Panel A2')
            ->assertViewHas('quota', fn (array $quota): bool => $quota['period'] === $period && $quota['orders_used'] === 8);
    }

    public function test_admin_can_export_billing_outlet_csv_with_scope(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-EXPORT-SCOPE-B',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 26000,
            'paid_amount' => 0,
            'due_amount' => 26000,
        ]);

        $response = $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&dataset=outlets');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('outlet_name', $content);
        $this->assertStringContainsString('Outlet Panel A1', $content);
        $this->assertStringNotContainsString('Outlet Panel A2', $content);
    }

    public function test_owner_can_export_billing_usage_csv_by_selected_period(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');
        $previousPeriod = now()->subMonth()->format('Y-m');

        QuotaUsage::query()->create([
            'tenant_id' => $tenant,
            'period' => $period,
            'orders_used' => 11,
        ]);

        QuotaUsage::query()->create([
            'tenant_id' => $tenant,
            'period' => $previousPeriod,
            'orders_used' => 7,
        ]);

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&dataset=usage');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('period,label,orders_limit,orders_used,orders_remaining,usage_percent,orders_count,paid_amount', $content);
        $this->assertStringContainsString($period, $content);
        $this->assertStringContainsString($previousPeriod, $content);
    }

    public function test_owner_can_filter_billing_by_outlet_scope(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-FILTER-A',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 20000,
            'paid_amount' => 0,
            'due_amount' => 20000,
        ]);

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-FILTER-B',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 26000,
            'paid_amount' => 0,
            'due_amount' => 26000,
        ]);

        $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&outlet_id='.$this->outletB->id)
            ->assertOk()
            ->assertViewHas('selectedOutletId', fn ($selectedOutletId): bool => $selectedOutletId === $this->outletB->id)
            ->assertViewHas('outletSummary', function ($rows): bool {
                if ($rows->count() !== 1) {
                    return false;
                }

                return (string) $rows->first()['outlet_id'] === $this->outletB->id;
            });
    }

    public function test_admin_can_filter_billing_by_payment_status(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-STATUS-PAID',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 30000,
            'paid_amount' => 30000,
            'due_amount' => 0,
        ]);

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&payment_status=paid')
            ->assertOk()
            ->assertViewHas('selectedPaymentStatus', fn ($selectedPaymentStatus): bool => $selectedPaymentStatus === 'paid')
            ->assertViewHas('ordersCount', fn (int $ordersCount): bool => $ordersCount === 1)
            ->assertViewHas('outstandingAmount', fn (int $outstandingAmount): bool => $outstandingAmount === 0);

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&payment_status=unpaid')
            ->assertOk()
            ->assertViewHas('selectedPaymentStatus', fn ($selectedPaymentStatus): bool => $selectedPaymentStatus === 'unpaid')
            ->assertViewHas('ordersCount', fn (int $ordersCount): bool => $ordersCount === 1);

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&payment_status=partial')
            ->assertOk()
            ->assertViewHas('selectedPaymentStatus', fn ($selectedPaymentStatus): bool => $selectedPaymentStatus === 'partial')
            ->assertViewHas('ordersCount', fn (int $ordersCount): bool => $ordersCount === 3)
            ->assertViewHas('selectedPaymentStatusLabel', fn (string $label): bool => $label === 'Sebagian');
    }

    public function test_owner_can_see_invoice_aging_report_summary_by_filter_scope(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        $agingOrder05d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-05D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 18000,
            'paid_amount' => 0,
            'due_amount' => 18000,
        ]);
        $agingOrder05d->timestamps = false;
        $agingOrder05d->forceFill([
            'created_at' => now()->subDays(5),
            'updated_at' => now()->subDays(5),
        ])->save();

        $agingOrder20d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-20D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 22000,
            'paid_amount' => 0,
            'due_amount' => 22000,
        ]);
        $agingOrder20d->timestamps = false;
        $agingOrder20d->forceFill([
            'created_at' => now()->subDays(20),
            'updated_at' => now()->subDays(20),
        ])->save();

        $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&outlet_id='.$this->outletB->id.'&payment_status=unpaid')
            ->assertOk()
            ->assertViewHas('agingOutstandingOrders', fn (int $count): bool => $count === 2)
            ->assertViewHas('agingOutstandingAmount', fn (int $amount): bool => $amount === 40000)
            ->assertViewHas('agingSummary', function ($rows): bool {
                $keyed = $rows->keyBy('bucket_key');

                return (int) ($keyed->get('d0_7')['orders_count'] ?? -1) === 1
                    && (int) ($keyed->get('d15_30')['orders_count'] ?? -1) === 1
                    && (int) ($keyed->get('d0_7')['due_amount'] ?? -1) === 18000
                    && (int) ($keyed->get('d15_30')['due_amount'] ?? -1) === 22000;
            });
    }

    public function test_owner_can_export_invoice_aging_csv_with_filters(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        $agingOrder09d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-EXPORT-09D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 15000,
            'paid_amount' => 0,
            'due_amount' => 15000,
        ]);
        $agingOrder09d->timestamps = false;
        $agingOrder09d->forceFill([
            'created_at' => now()->subDays(9),
            'updated_at' => now()->subDays(9),
        ])->save();

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&outlet_id='.$this->outletB->id.'&payment_status=unpaid&dataset=aging');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('bucket_key,bucket_label,orders_count,due_amount,due_percent', $content);
        $this->assertStringContainsString('d8_14', $content);
        $this->assertStringContainsString('8-14 hari', $content);
    }

    public function test_owner_can_filter_aging_detail_by_bucket(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        $agingOrder05d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-BUCKET-05D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 12000,
            'paid_amount' => 0,
            'due_amount' => 12000,
        ]);
        $agingOrder05d->timestamps = false;
        $agingOrder05d->forceFill([
            'created_at' => now()->subDays(5),
            'updated_at' => now()->subDays(5),
        ])->save();

        $agingOrder35d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-BUCKET-35D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 34000,
            'paid_amount' => 0,
            'due_amount' => 34000,
        ]);
        $agingOrder35d->timestamps = false;
        $agingOrder35d->forceFill([
            'created_at' => now()->subDays(35),
            'updated_at' => now()->subDays(35),
        ])->save();

        $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&outlet_id='.$this->outletB->id.'&payment_status=unpaid&aging_bucket=d31_plus')
            ->assertOk()
            ->assertViewHas('selectedAgingBucket', fn ($selectedAgingBucket): bool => $selectedAgingBucket === 'd31_plus')
            ->assertViewHas('agingOutstandingOrders', fn (int $count): bool => $count === 1)
            ->assertViewHas('agingOutstandingAmount', fn (int $amount): bool => $amount === 34000)
            ->assertViewHas('agingOrderDetails', function ($rows): bool {
                if ($rows->count() !== 1) {
                    return false;
                }

                return (string) $rows->first()['bucket_key'] === 'd31_plus'
                    && (string) $rows->first()['order_code'] === 'ORD-AGING-BUCKET-35D';
            });
    }

    public function test_owner_can_export_aging_detail_csv_with_bucket_filter(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        $agingOrder09d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-DETAIL-09D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 19000,
            'paid_amount' => 0,
            'due_amount' => 19000,
        ]);
        $agingOrder09d->timestamps = false;
        $agingOrder09d->forceFill([
            'created_at' => now()->subDays(9),
            'updated_at' => now()->subDays(9),
        ])->save();

        $agingOrder40d = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-AGING-DETAIL-40D',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 29000,
            'paid_amount' => 0,
            'due_amount' => 29000,
        ]);
        $agingOrder40d->timestamps = false;
        $agingOrder40d->forceFill([
            'created_at' => now()->subDays(40),
            'updated_at' => now()->subDays(40),
        ])->save();

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&outlet_id='.$this->outletB->id.'&payment_status=unpaid&aging_bucket=d8_14&dataset=aging_details');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('bucket_key,bucket_label,age_days', $content);
        $this->assertStringContainsString('ORD-AGING-DETAIL-09D', $content);
        $this->assertStringContainsString('d8_14', $content);
        $this->assertStringNotContainsString('ORD-AGING-DETAIL-40D', $content);
    }

    public function test_owner_can_export_billing_order_detail_csv_with_outlet_filter(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-DETAIL-A',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 22000,
            'paid_amount' => 0,
            'due_amount' => 22000,
        ]);

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-DETAIL-B',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 30000,
            'paid_amount' => 0,
            'due_amount' => 30000,
        ]);

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&outlet_id='.$this->outletB->id.'&dataset=orders');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('invoice_or_order_code', $content);
        $this->assertStringContainsString('ORD-BILLING-DETAIL-B', $content);
        $this->assertStringContainsString('Outlet Panel A2', $content);
        $this->assertStringNotContainsString('ORD-BILLING-DETAIL-A', $content);
        $this->assertStringNotContainsString('Outlet Panel A1', $content);
    }

    public function test_owner_can_export_billing_order_detail_csv_with_payment_status_filter(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-PAID-EXPORT',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 28000,
            'paid_amount' => 28000,
            'due_amount' => 0,
        ]);

        Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-BILLING-UNPAID-EXPORT',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 25000,
            'paid_amount' => 5000,
            'due_amount' => 20000,
        ]);

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&payment_status=paid&dataset=orders');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('ORD-BILLING-PAID-EXPORT', $content);
        $this->assertStringNotContainsString('ORD-BILLING-UNPAID-EXPORT', $content);
    }

    public function test_admin_can_update_aging_collection_workflow_from_billing_panel(): void
    {
        $tenant = $this->tenantA->id;
        $nextFollowUpAt = now()->addDay()->seconds(0);

        $order = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-COLLECTION-UPDATE-001',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 31000,
            'paid_amount' => 10000,
            'due_amount' => 21000,
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/billing/collections/'.$order->id, [
                'collection_status' => 'contacted',
                'collection_next_follow_up_at' => $nextFollowUpAt->format('Y-m-d H:i:s'),
                'collection_note' => 'Hubungi ulang besok.',
            ])
            ->assertRedirect();

        $order = $order->fresh();

        $this->assertSame('contacted', (string) $order?->collection_status);
        $this->assertSame('Hubungi ulang besok.', (string) $order?->collection_note);
        $this->assertNotNull($order?->collection_last_contacted_at);
        $this->assertSame(
            $nextFollowUpAt->format('Y-m-d H:i:s'),
            $order?->collection_next_follow_up_at?->format('Y-m-d H:i:s')
        );

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_COLLECTION_UPDATED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => $order?->id,
        ]);
    }

    public function test_owner_can_filter_aging_detail_by_collection_status_and_export_cash_daily_csv(): void
    {
        $tenant = $this->tenantA->id;
        $period = now()->format('Y-m');
        $cashDate = now()->format('Y-m-d');

        $orderPending = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-COLLECTION-PENDING',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 17000,
            'paid_amount' => 0,
            'due_amount' => 17000,
        ]);

        $orderEscalated = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-COLLECTION-ESCALATED',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 25000,
            'paid_amount' => 5000,
            'due_amount' => 20000,
            'collection_status' => 'escalated',
            'collection_note' => 'Perlu eskalasi owner',
        ]);

        Payment::query()->create([
            'order_id' => $orderEscalated->id,
            'amount' => 5000,
            'method' => 'cash',
            'paid_at' => now(),
            'notes' => 'Bayar sebagian',
            'created_by' => $this->owner->id,
            'updated_by' => $this->owner->id,
            'source_channel' => 'web',
        ]);

        $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing?period='.$period.'&outlet_id='.$this->outletB->id.'&payment_status=partial&collection_status=escalated')
            ->assertOk()
            ->assertViewHas('selectedCollectionStatus', fn ($status): bool => $status === 'escalated')
            ->assertViewHas('agingOrderDetails', function ($rows) use ($orderEscalated): bool {
                if ($rows->count() !== 1) {
                    return false;
                }

                return (string) $rows->first()['order_code'] === $orderEscalated->order_code
                    && (string) $rows->first()['collection_status'] === 'escalated';
            })
            ->assertDontSeeText($orderPending->order_code);

        $response = $this->actingAs($this->owner, 'web')
            ->get('/t/'.$tenant.'/billing/export?period='.$period.'&outlet_id='.$this->outletB->id.'&cash_date='.$cashDate.'&dataset=cash_daily');

        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();

        $this->assertStringContainsString('payment_method,payment_amount,order_due_amount', $content);
        $this->assertStringContainsString('ORD-COLLECTION-ESCALATED', $content);
        $this->assertStringContainsString($cashDate, $content);
    }

    public function test_admin_can_create_order_from_web_transaction_form(): void
    {
        $tenant = $this->tenantA->id;

        $response = $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders', [
                'outlet_id' => $this->outletA->id,
                'order_code' => 'ORD-WEB-TX-001',
                'invoice_no' => 'INV-WEB-TX-001',
                'shipping_fee_amount' => 2000,
                'discount_amount' => 1000,
                'notes' => 'transaksi web',
                'customer' => [
                    'name' => 'Customer Web TX',
                    'phone' => '0812-3333-4444',
                    'notes' => 'vip',
                ],
                'items' => [
                    [
                        'service_id' => $this->service->id,
                        'weight_kg' => 2,
                    ],
                ],
            ]);

        $order = Order::query()
            ->where('tenant_id', $tenant)
            ->where('order_code', 'ORD-WEB-TX-001')
            ->firstOrFail();

        $response->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        $this->assertDatabaseHas('customers', [
            'tenant_id' => $tenant,
            'name' => 'Customer Web TX',
            'phone_normalized' => '6281233334444',
        ]);

        $this->assertDatabaseHas('orders', [
            'id' => $order->id,
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'invoice_no' => 'INV-WEB-TX-001',
            'total_amount' => 19000,
            'paid_amount' => 0,
            'due_amount' => 19000,
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('order_items', [
            'order_id' => $order->id,
            'service_id' => $this->service->id,
            'unit_price_amount' => 9000,
            'subtotal_amount' => 18000,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_CREATED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $order->id,
        ]);
    }

    public function test_web_order_create_upserts_existing_customer_by_phone(): void
    {
        $tenant = $this->tenantA->id;
        $existingCustomerId = $this->customer->id;

        $existingCount = Customer::query()
            ->where('tenant_id', $tenant)
            ->count();

        $response = $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders', [
                'outlet_id' => $this->outletA->id,
                'order_code' => 'ORD-WEB-TX-UPSERT',
                'shipping_fee_amount' => 0,
                'discount_amount' => 0,
                'customer' => [
                    'name' => 'Customer Panel Updated',
                    'phone' => '0811-1111-111',
                    'notes' => 'updated by web',
                ],
                'items' => [
                    [
                        'service_id' => $this->service->id,
                        'weight_kg' => 1,
                    ],
                ],
            ]);

        $order = Order::query()
            ->where('tenant_id', $tenant)
            ->where('order_code', 'ORD-WEB-TX-UPSERT')
            ->firstOrFail();

        $response->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        $tenantCountAfter = Customer::query()
            ->where('tenant_id', $tenant)
            ->count();
        $this->assertSame($existingCount, $tenantCountAfter);

        $this->assertDatabaseHas('customers', [
            'id' => $existingCustomerId,
            'tenant_id' => $tenant,
            'name' => 'Customer Panel Updated',
            'phone_normalized' => '628111111111',
            'notes' => 'updated by web',
        ]);

        $this->assertDatabaseHas('orders', [
            'id' => $order->id,
            'tenant_id' => $tenant,
            'customer_id' => $existingCustomerId,
        ]);
    }

    public function test_admin_cannot_create_order_for_out_of_scope_outlet_via_web_form(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/orders/create')
            ->post('/t/'.$tenant.'/orders', [
                'outlet_id' => $this->outletB->id,
                'order_code' => 'ORD-WEB-TX-SCOPE',
                'shipping_fee_amount' => 0,
                'discount_amount' => 0,
                'customer' => [
                    'name' => 'Customer Scope',
                    'phone' => '081233334445',
                ],
                'items' => [
                    [
                        'service_id' => $this->service->id,
                        'weight_kg' => 1,
                    ],
                ],
            ])
            ->assertRedirect('/t/'.$tenant.'/orders/create')
            ->assertSessionHasErrors('order');

        $this->assertDatabaseMissing('orders', [
            'tenant_id' => $tenant,
            'order_code' => 'ORD-WEB-TX-SCOPE',
        ]);
    }

    public function test_admin_can_create_web_order_with_multiple_items(): void
    {
        $tenant = $this->tenantA->id;

        $pcsService = Service::query()->create([
            'tenant_id' => $tenant,
            'name' => 'Service Pcs',
            'unit_type' => 'pcs',
            'base_price_amount' => 5000,
            'active' => true,
        ]);

        OutletService::query()->create([
            'outlet_id' => $this->outletA->id,
            'service_id' => $pcsService->id,
            'active' => true,
            'price_override_amount' => 5500,
            'sla_override' => 'same day',
        ]);

        $response = $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders', [
                'outlet_id' => $this->outletA->id,
                'order_code' => 'ORD-WEB-TX-MULTI',
                'shipping_fee_amount' => 2000,
                'discount_amount' => 500,
                'customer' => [
                    'name' => 'Customer Multi Item',
                    'phone' => '0813-2222-3333',
                ],
                'items' => [
                    [
                        'service_id' => $this->service->id,
                        'weight_kg' => 1.5,
                    ],
                    [
                        'service_id' => $pcsService->id,
                        'qty' => 3,
                    ],
                ],
            ]);

        $order = Order::query()
            ->where('tenant_id', $tenant)
            ->where('order_code', 'ORD-WEB-TX-MULTI')
            ->firstOrFail();

        $response->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $order->id]));

        $this->assertDatabaseHas('orders', [
            'id' => $order->id,
            'tenant_id' => $tenant,
            'total_amount' => 31500, // (1.5*9000)+(3*5500)+2000-500
            'due_amount' => 31500,
            'paid_amount' => 0,
        ]);

        $this->assertSame(2, OrderItem::query()->where('order_id', $order->id)->count());

        $this->assertDatabaseHas('order_items', [
            'order_id' => $order->id,
            'service_id' => $this->service->id,
            'subtotal_amount' => 13500,
        ]);

        $this->assertDatabaseHas('order_items', [
            'order_id' => $order->id,
            'service_id' => $pcsService->id,
            'unit_price_amount' => 5500,
            'subtotal_amount' => 16500,
        ]);
    }

    public function test_admin_can_add_payment_from_web_order_detail(): void
    {
        $tenant = $this->tenantA->id;
        $existingPaymentCount = Payment::query()->where('order_id', $this->walkInOrder->id)->count();

        $response = $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->walkInOrder->id.'/payments', [
                'amount' => 7000,
                'method' => 'cash',
                'notes' => 'DP tahap 2',
            ]);

        $response->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $this->walkInOrder->id]));

        $payment = Payment::query()
            ->where('order_id', $this->walkInOrder->id)
            ->where('amount', 7000)
            ->latest('created_at')
            ->firstOrFail();

        $this->assertSame($existingPaymentCount + 1, Payment::query()->where('order_id', $this->walkInOrder->id)->count());

        $this->assertDatabaseHas('orders', [
            'id' => $this->walkInOrder->id,
            'tenant_id' => $tenant,
            'paid_amount' => 7000,
            'due_amount' => 11000,
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'order_id' => $this->walkInOrder->id,
            'amount' => 7000,
            'method' => 'cash',
            'notes' => 'DP tahap 2',
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'PAYMENT_ADDED',
            'channel' => 'web',
            'entity_type' => 'payment',
            'entity_id' => (string) $payment->id,
        ]);
    }

    public function test_admin_can_use_quick_action_full_payment_from_web_order_detail(): void
    {
        $tenant = $this->tenantA->id;

        $response = $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->walkInOrder->id.'/payments', [
                'method' => 'qris',
                'quick_action' => 'full',
            ]);

        $response->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $this->walkInOrder->id]));

        $payment = Payment::query()
            ->where('order_id', $this->walkInOrder->id)
            ->latest('created_at')
            ->firstOrFail();

        $this->assertDatabaseHas('payments', [
            'id' => $payment->id,
            'order_id' => $this->walkInOrder->id,
            'amount' => 18000,
            'method' => 'qris',
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('orders', [
            'id' => $this->walkInOrder->id,
            'tenant_id' => $tenant,
            'paid_amount' => 18000,
            'due_amount' => 0,
            'source_channel' => 'web',
        ]);
    }

    public function test_quick_payment_action_rejects_already_paid_order(): void
    {
        $tenant = $this->tenantA->id;
        $paidOrder = Order::query()->create([
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletA->id,
            'customer_id' => $this->customer->id,
            'order_code' => 'ORD-WEB-TX-LUNAS',
            'is_pickup_delivery' => false,
            'laundry_status' => 'ready',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 15000,
            'paid_amount' => 15000,
            'due_amount' => 0,
        ]);

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/orders/'.$paidOrder->id)
            ->post('/t/'.$tenant.'/orders/'.$paidOrder->id.'/payments', [
                'method' => 'cash',
                'quick_action' => 'full',
            ])
            ->assertRedirect('/t/'.$tenant.'/orders/'.$paidOrder->id)
            ->assertSessionHasErrors('payment');

        $this->assertDatabaseMissing('payments', [
            'order_id' => $paidOrder->id,
            'method' => 'cash',
            'source_channel' => 'web',
        ]);
    }

    public function test_admin_cannot_add_payment_for_order_outside_scope(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->foreignOrderId.'/payments', [
                'amount' => 5000,
                'method' => 'transfer',
            ])
            ->assertNotFound();

        $this->assertDatabaseMissing('payments', [
            'amount' => 5000,
            'method' => 'transfer',
            'source_channel' => 'web',
        ]);
    }

    public function test_admin_can_update_laundry_status_from_order_detail(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->orderA->id.'/status/laundry', [
                'laundry_status' => 'ready',
            ])
            ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $this->orderA->id]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->orderA->id,
            'tenant_id' => $tenant,
            'laundry_status' => 'ready',
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_LAUNDRY_STATUS_UPDATED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $this->orderA->id,
        ]);
    }

    public function test_laundry_status_guard_shows_invalid_transition_reason_on_detail_order(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/orders/'.$this->orderA->id)
            ->post('/t/'.$tenant.'/orders/'.$this->orderA->id.'/status/laundry', [
                'laundry_status' => 'completed',
            ])
            ->assertRedirect('/t/'.$tenant.'/orders/'.$this->orderA->id)
            ->assertSessionHasErrors('laundry_status');

        $this->assertDatabaseHas('orders', [
            'id' => $this->orderA->id,
            'tenant_id' => $tenant,
            'laundry_status' => 'ironing',
        ]);
    }

    public function test_admin_can_update_courier_status_from_order_detail(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->courierOrderReady->id.'/status/courier', [
                'courier_status' => 'delivery_pending',
            ])
            ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $this->courierOrderReady->id]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->courierOrderReady->id,
            'tenant_id' => $tenant,
            'courier_status' => 'delivery_pending',
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_COURIER_STATUS_UPDATED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $this->courierOrderReady->id,
        ]);
    }

    public function test_courier_status_guard_shows_laundry_not_ready_reason_on_detail_order(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/orders/'.$this->courierOrderBlocked->id)
            ->post('/t/'.$tenant.'/orders/'.$this->courierOrderBlocked->id.'/status/courier', [
                'courier_status' => 'delivery_pending',
            ])
            ->assertRedirect('/t/'.$tenant.'/orders/'.$this->courierOrderBlocked->id)
            ->assertSessionHasErrors('courier_status');

        $this->assertDatabaseHas('orders', [
            'id' => $this->courierOrderBlocked->id,
            'tenant_id' => $tenant,
            'courier_status' => 'at_outlet',
        ]);
    }

    public function test_admin_can_assign_courier_from_order_detail(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->orderA->id.'/assign-courier', [
                'courier_user_id' => $this->courier->id,
            ])
            ->assertRedirect(route('tenant.orders.show', ['tenant' => $tenant, 'order' => $this->orderA->id]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->orderA->id,
            'tenant_id' => $tenant,
            'courier_user_id' => $this->courier->id,
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_COURIER_ASSIGNED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $this->orderA->id,
        ]);
    }

    public function test_admin_cannot_assign_courier_for_order_outside_scope(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/'.$this->foreignOrderId.'/assign-courier', [
                'courier_user_id' => $this->courier->id,
            ])
            ->assertNotFound();
    }

    public function test_admin_can_apply_bulk_laundry_status_update(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'mark-ready',
                'selected_ids' => $this->orderA->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->orderA->id,
            'tenant_id' => $tenant,
            'laundry_status' => 'ready',
            'source_channel' => 'web',
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'mark-completed',
                'selected_ids' => $this->orderA->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->orderA->id,
            'tenant_id' => $tenant,
            'laundry_status' => 'completed',
            'source_channel' => 'web',
        ]);
    }

    public function test_bulk_action_rejects_out_of_scope_order_selection(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/orders')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'mark-ready',
                'selected_ids' => $this->foreignOrderId,
            ])
            ->assertRedirect('/t/'.$tenant.'/orders')
            ->assertSessionHasErrors('bulk');
    }

    public function test_bulk_report_contains_mixed_updated_and_not_found_rows(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'mark-ready',
                'selected_ids' => $this->orderA->id.','.$this->foreignOrderId,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]))
            ->assertSessionHas('bulk_report', function ($report): bool {
                if (! is_array($report)) {
                    return false;
                }

                if (($report['updated'] ?? null) !== 1 || ($report['skipped'] ?? null) !== 1) {
                    return false;
                }

                $rows = collect($report['rows'] ?? []);

                return $rows->contains(
                    fn ($row): bool => is_array($row)
                        && ($row['order_id'] ?? null) === $this->orderA->id
                        && ($row['result'] ?? null) === 'updated',
                ) && $rows->contains(
                    fn ($row): bool => is_array($row)
                        && ($row['order_id'] ?? null) === $this->foreignOrderId
                        && ($row['result'] ?? null) === 'skipped'
                        && ($row['reason_code'] ?? null) === 'NOT_FOUND',
                );
            });
    }

    public function test_admin_can_assign_courier_via_bulk_action(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'assign-courier',
                'selected_ids' => $this->orderA->id,
                'courier_user_id' => $this->courier->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]))
            ->assertSessionHas('bulk_report', function ($report): bool {
                if (! is_array($report)) {
                    return false;
                }

                if (($report['updated'] ?? null) !== 1 || ($report['skipped'] ?? null) !== 0) {
                    return false;
                }

                $rows = collect($report['rows'] ?? []);

                return $rows->contains(
                    fn ($row): bool => is_array($row)
                        && ($row['order_id'] ?? null) === $this->orderA->id
                        && ($row['result'] ?? null) === 'updated',
                );
            });

        $this->assertDatabaseHas('orders', [
            'id' => $this->orderA->id,
            'tenant_id' => $tenant,
            'courier_user_id' => $this->courier->id,
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_COURIER_ASSIGNED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $this->orderA->id,
        ]);
    }

    public function test_bulk_assign_courier_skips_non_pickup_delivery_orders(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'assign-courier',
                'selected_ids' => $this->walkInOrder->id.','.$this->orderA->id,
                'courier_user_id' => $this->courier->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]))
            ->assertSessionHas('bulk_report', function ($report): bool {
                if (! is_array($report)) {
                    return false;
                }

                if (($report['updated'] ?? null) !== 1 || ($report['skipped'] ?? null) !== 1) {
                    return false;
                }

                $rows = collect($report['rows'] ?? []);

                return $rows->contains(
                    fn ($row): bool => is_array($row)
                        && ($row['order_id'] ?? null) === $this->walkInOrder->id
                        && ($row['result'] ?? null) === 'skipped'
                        && ($row['reason_code'] ?? null) === 'NOT_PICKUP_DELIVERY',
                ) && $rows->contains(
                    fn ($row): bool => is_array($row)
                        && ($row['order_id'] ?? null) === $this->orderA->id
                        && ($row['result'] ?? null) === 'updated',
                );
            });

        $this->assertDatabaseHas('orders', [
            'id' => $this->walkInOrder->id,
            'tenant_id' => $tenant,
            'courier_user_id' => null,
        ]);
    }

    public function test_order_board_renders_bulk_report_filter_controls(): void
    {
        $tenant = $this->tenantA->id;

        $response = $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'mark-ready',
                'selected_ids' => $this->orderA->id.','.$this->foreignOrderId,
            ]);

        $this->followRedirects($response)
            ->assertOk()
            ->assertSeeText('Laporan Aksi Massal')
            ->assertSeeText('Cari laporan')
            ->assertSeeText('Filter alasan');
    }

    public function test_admin_can_apply_bulk_courier_status_update(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'courier-delivery-pending',
                'selected_ids' => $this->courierOrderReady->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->courierOrderReady->id,
            'tenant_id' => $tenant,
            'courier_status' => 'delivery_pending',
            'source_channel' => 'web',
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'courier-delivery-otw',
                'selected_ids' => $this->courierOrderReady->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->courierOrderReady->id,
            'tenant_id' => $tenant,
            'courier_status' => 'delivery_on_the_way',
            'source_channel' => 'web',
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'courier-delivered',
                'selected_ids' => $this->courierOrderReady->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('orders', [
            'id' => $this->courierOrderReady->id,
            'tenant_id' => $tenant,
            'courier_status' => 'delivered',
            'source_channel' => 'web',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_COURIER_STATUS_UPDATED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $this->courierOrderReady->id,
        ]);
    }

    public function test_bulk_courier_delivery_pending_skips_when_laundry_not_ready(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/orders/bulk-update', [
                'action' => 'courier-delivery-pending',
                'selected_ids' => $this->courierOrderBlocked->id,
            ])
            ->assertRedirect(route('tenant.orders.index', ['tenant' => $tenant]))
            ->assertSessionHas('bulk_report', function ($report): bool {
                if (! is_array($report)) {
                    return false;
                }

                if (($report['updated'] ?? null) !== 0 || ($report['skipped'] ?? null) !== 1) {
                    return false;
                }

                $rows = collect($report['rows'] ?? []);

                return $rows->contains(
                    fn ($row): bool => is_array($row)
                        && ($row['order_id'] ?? null) === $this->courierOrderBlocked->id
                        && ($row['result'] ?? null) === 'skipped'
                        && ($row['reason_code'] ?? null) === 'LAUNDRY_NOT_READY',
                );
            });

        $this->assertDatabaseHas('orders', [
            'id' => $this->courierOrderBlocked->id,
            'tenant_id' => $tenant,
            'laundry_status' => 'ironing',
            'courier_status' => 'at_outlet',
        ]);

        $this->assertDatabaseMissing('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'ORDER_COURIER_STATUS_UPDATED',
            'channel' => 'web',
            'entity_type' => 'order',
            'entity_id' => (string) $this->courierOrderBlocked->id,
        ]);
    }

    public function test_owner_can_archive_and_restore_user_from_web_management(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/users/'.$this->admin->id.'/archive')
            ->assertRedirect(route('tenant.users.index', ['tenant' => $tenant]));

        $this->assertSoftDeleted('users', [
            'id' => $this->admin->id,
            'tenant_id' => $tenant,
        ]);

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/users/'.$this->admin->id.'/restore')
            ->assertRedirect(route('tenant.users.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('users', [
            'id' => $this->admin->id,
            'tenant_id' => $tenant,
            'deleted_at' => null,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->owner->id,
            'event_key' => 'USER_ARCHIVED',
            'channel' => 'web',
            'entity_type' => 'user',
            'entity_id' => (string) $this->admin->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->owner->id,
            'event_key' => 'USER_RESTORED',
            'channel' => 'web',
            'entity_type' => 'user',
            'entity_id' => (string) $this->admin->id,
        ]);
    }

    public function test_owner_can_invite_and_reassign_user_from_web_management(): void
    {
        $tenant = $this->tenantA->id;
        $cashierRole = Role::query()->where('key', 'cashier')->firstOrFail();
        $courierRole = Role::query()->where('key', 'courier')->firstOrFail();

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/users/invite', [
                'name' => 'Invite Ops',
                'email' => 'invite.ops@panel.local',
                'phone' => '628777777777',
                'password' => 'password123',
                'status' => 'active',
                'role_key' => 'cashier',
                'outlet_ids' => [$this->outletA->id],
            ])
            ->assertRedirect(route('tenant.users.index', ['tenant' => $tenant]));

        $invited = User::query()
            ->where('tenant_id', $tenant)
            ->where('email', 'invite.ops@panel.local')
            ->firstOrFail();

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $invited->id,
            'role_id' => $cashierRole->id,
        ]);

        $this->assertDatabaseHas('user_outlets', [
            'user_id' => $invited->id,
            'outlet_id' => $this->outletA->id,
        ]);

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/users/'.$invited->id.'/assignment', [
                'status' => 'inactive',
                'role_key' => 'courier',
                'outlet_ids' => [$this->outletA->id, $this->outletB->id],
            ])
            ->assertRedirect(route('tenant.users.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('users', [
            'id' => $invited->id,
            'tenant_id' => $tenant,
            'status' => 'inactive',
        ]);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $invited->id,
            'role_id' => $cashierRole->id,
        ]);

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $invited->id,
            'role_id' => $courierRole->id,
        ]);

        $this->assertDatabaseHas('user_outlets', [
            'user_id' => $invited->id,
            'outlet_id' => $this->outletA->id,
        ]);

        $this->assertDatabaseHas('user_outlets', [
            'user_id' => $invited->id,
            'outlet_id' => $this->outletB->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->owner->id,
            'event_key' => 'USER_INVITED',
            'channel' => 'web',
            'entity_type' => 'user',
            'entity_id' => (string) $invited->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->owner->id,
            'event_key' => 'USER_ASSIGNMENT_UPDATED',
            'channel' => 'web',
            'entity_type' => 'user',
            'entity_id' => (string) $invited->id,
        ]);
    }

    public function test_admin_can_invite_operational_user_with_scoped_outlet(): void
    {
        $tenant = $this->tenantA->id;
        $workerRole = Role::query()->where('key', 'worker')->firstOrFail();

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/users/invite', [
                'name' => 'Worker Scope',
                'email' => 'worker.scope@panel.local',
                'password' => 'password123',
                'status' => 'active',
                'role_key' => 'worker',
                'outlet_ids' => [$this->outletA->id],
            ])
            ->assertRedirect(route('tenant.users.index', ['tenant' => $tenant]));

        $invited = User::query()
            ->where('tenant_id', $tenant)
            ->where('email', 'worker.scope@panel.local')
            ->firstOrFail();

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $invited->id,
            'role_id' => $workerRole->id,
        ]);

        $this->assertDatabaseHas('user_outlets', [
            'user_id' => $invited->id,
            'outlet_id' => $this->outletA->id,
        ]);

        $this->assertDatabaseMissing('user_outlets', [
            'user_id' => $invited->id,
            'outlet_id' => $this->outletB->id,
        ]);
    }

    public function test_admin_cannot_manage_forbidden_roles_or_out_of_scope_outlets(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/users')
            ->post('/t/'.$tenant.'/users/invite', [
                'name' => 'Admin Invalid',
                'email' => 'admin.invalid@panel.local',
                'password' => 'password123',
                'status' => 'active',
                'role_key' => 'admin',
                'outlet_ids' => [$this->outletA->id],
            ])
            ->assertRedirect('/t/'.$tenant.'/users')
            ->assertSessionHasErrors('role_key');

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/users/'.$this->owner->id.'/assignment', [
                'status' => 'active',
                'role_key' => 'cashier',
                'outlet_ids' => [$this->outletA->id],
            ])
            ->assertStatus(403);

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/users')
            ->post('/t/'.$tenant.'/users/'.$this->courier->id.'/assignment', [
                'status' => 'active',
                'role_key' => 'courier',
                'outlet_ids' => [$this->outletA->id, $this->outletB->id],
            ])
            ->assertRedirect('/t/'.$tenant.'/users')
            ->assertSessionHasErrors('user_management');

        $this->assertDatabaseMissing('user_outlets', [
            'user_id' => $this->courier->id,
            'outlet_id' => $this->outletB->id,
        ]);
    }

    public function test_owner_can_archive_and_restore_outlet_from_web_management(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/outlets/'.$this->outletB->id.'/archive')
            ->assertRedirect(route('tenant.outlets.index', ['tenant' => $tenant]));

        $this->assertSoftDeleted('outlets', [
            'id' => $this->outletB->id,
            'tenant_id' => $tenant,
        ]);

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/outlets/'.$this->outletB->id.'/restore')
            ->assertRedirect(route('tenant.outlets.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('outlets', [
            'id' => $this->outletB->id,
            'tenant_id' => $tenant,
            'deleted_at' => null,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->owner->id,
            'event_key' => 'OUTLET_ARCHIVED',
            'channel' => 'web',
            'entity_type' => 'outlet',
            'entity_id' => $this->outletB->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->owner->id,
            'event_key' => 'OUTLET_RESTORED',
            'channel' => 'web',
            'entity_type' => 'outlet',
            'entity_id' => $this->outletB->id,
        ]);
    }

    public function test_owner_lifecycle_guards_block_self_user_and_last_outlet_archive(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->owner, 'web')
            ->from('/t/'.$tenant.'/users')
            ->post('/t/'.$tenant.'/users/'.$this->owner->id.'/archive')
            ->assertRedirect('/t/'.$tenant.'/users')
            ->assertSessionHasErrors('lifecycle');

        $this->actingAs($this->owner, 'web')
            ->post('/t/'.$tenant.'/outlets/'.$this->outletB->id.'/archive')
            ->assertRedirect(route('tenant.outlets.index', ['tenant' => $tenant]));

        $this->actingAs($this->owner, 'web')
            ->from('/t/'.$tenant.'/outlets')
            ->post('/t/'.$tenant.'/outlets/'.$this->outletA->id.'/archive')
            ->assertRedirect('/t/'.$tenant.'/outlets')
            ->assertSessionHasErrors('lifecycle');
    }

    public function test_admin_cannot_execute_owner_only_lifecycle_actions(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/users/'.$this->cashier->id.'/archive')
            ->assertStatus(403);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/outlets/'.$this->outletB->id.'/archive')
            ->assertStatus(403);
    }

    public function test_admin_can_archive_and_restore_customer_and_service_from_web_management(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/customers/'.$this->customer->id.'/archive')
            ->assertRedirect(route('tenant.customers.index', ['tenant' => $tenant]));

        $this->assertSoftDeleted('customers', [
            'id' => $this->customer->id,
            'tenant_id' => $tenant,
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/customers/'.$this->customer->id.'/restore')
            ->assertRedirect(route('tenant.customers.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('customers', [
            'id' => $this->customer->id,
            'tenant_id' => $tenant,
            'deleted_at' => null,
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/services/'.$this->service->id.'/archive')
            ->assertRedirect(route('tenant.services.index', ['tenant' => $tenant]));

        $this->assertSoftDeleted('services', [
            'id' => $this->service->id,
            'tenant_id' => $tenant,
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/services/'.$this->service->id.'/restore')
            ->assertRedirect(route('tenant.services.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('services', [
            'id' => $this->service->id,
            'tenant_id' => $tenant,
            'deleted_at' => null,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'CUSTOMER_ARCHIVED',
            'channel' => 'web',
            'entity_type' => 'customer',
            'entity_id' => $this->customer->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'SERVICE_ARCHIVED',
            'channel' => 'web',
            'entity_type' => 'service',
            'entity_id' => $this->service->id,
        ]);
    }

    public function test_admin_can_create_and_toggle_shipping_zone_from_web_panel(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/shipping-zones')
            ->assertOk()
            ->assertSeeText('Buat Zona Pengantaran');

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/shipping-zones', [
                'outlet_id' => $this->outletA->id,
                'name' => 'Zona Web A1',
                'min_distance_km' => 0,
                'max_distance_km' => 5,
                'fee_amount' => 12000,
                'eta_minutes' => 25,
                'active' => '1',
            ])
            ->assertRedirect(route('tenant.shipping-zones.index', ['tenant' => $tenant]));

        $zone = ShippingZone::query()
            ->where('tenant_id', $tenant)
            ->where('outlet_id', $this->outletA->id)
            ->where('name', 'Zona Web A1')
            ->firstOrFail();

        $this->assertDatabaseHas('shipping_zones', [
            'id' => $zone->id,
            'tenant_id' => $tenant,
            'active' => true,
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/shipping-zones/'.$zone->id.'/update', [
                'name' => 'Zona Web A1 Updated',
                'min_distance_km' => 1,
                'max_distance_km' => 6,
                'fee_amount' => 14000,
                'eta_minutes' => 35,
                'notes' => 'updated via web panel',
            ])
            ->assertRedirect(route('tenant.shipping-zones.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('shipping_zones', [
            'id' => $zone->id,
            'tenant_id' => $tenant,
            'name' => 'Zona Web A1 Updated',
            'fee_amount' => 14000,
            'eta_minutes' => 35,
            'notes' => 'updated via web panel',
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/shipping-zones/'.$zone->id.'/deactivate')
            ->assertRedirect(route('tenant.shipping-zones.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('shipping_zones', [
            'id' => $zone->id,
            'tenant_id' => $tenant,
            'active' => false,
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/shipping-zones/'.$zone->id.'/activate')
            ->assertRedirect(route('tenant.shipping-zones.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('shipping_zones', [
            'id' => $zone->id,
            'tenant_id' => $tenant,
            'active' => true,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'SHIPPING_ZONE_CREATED',
            'channel' => 'web',
            'entity_type' => 'shipping_zone',
            'entity_id' => $zone->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'SHIPPING_ZONE_UPDATED',
            'channel' => 'web',
            'entity_type' => 'shipping_zone',
            'entity_id' => $zone->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'SHIPPING_ZONE_DEACTIVATED',
            'channel' => 'web',
            'entity_type' => 'shipping_zone',
            'entity_id' => $zone->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'SHIPPING_ZONE_ACTIVATED',
            'channel' => 'web',
            'entity_type' => 'shipping_zone',
            'entity_id' => $zone->id,
        ]);
    }

    public function test_admin_cannot_create_shipping_zone_for_out_of_scope_outlet(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/shipping-zones')
            ->post('/t/'.$tenant.'/shipping-zones', [
                'outlet_id' => $this->outletB->id,
                'name' => 'Zona Scope Invalid',
                'fee_amount' => 15000,
            ])
            ->assertRedirect('/t/'.$tenant.'/shipping-zones')
            ->assertSessionHasErrors('shipping_zone');

        $this->assertDatabaseMissing('shipping_zones', [
            'tenant_id' => $tenant,
            'outlet_id' => $this->outletB->id,
            'name' => 'Zona Scope Invalid',
        ]);
    }

    public function test_admin_can_upsert_and_update_outlet_service_override_from_web_panel(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$tenant.'/outlet-services')
            ->assertOk()
            ->assertSeeText('Buat / Perbarui Override');

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/outlet-services/upsert', [
                'outlet_id' => $this->outletA->id,
                'service_id' => $this->service->id,
                'active' => '1',
                'price_override_amount' => 9700,
                'sla_override' => '24 jam',
            ])
            ->assertRedirect(route('tenant.outlet-services.index', ['tenant' => $tenant]));

        $override = OutletService::query()
            ->where('outlet_id', $this->outletA->id)
            ->where('service_id', $this->service->id)
            ->firstOrFail();

        $this->assertDatabaseHas('outlet_services', [
            'id' => $override->id,
            'outlet_id' => $this->outletA->id,
            'service_id' => $this->service->id,
            'active' => true,
            'price_override_amount' => 9700,
            'sla_override' => '24 jam',
        ]);

        $this->actingAs($this->admin, 'web')
            ->post('/t/'.$tenant.'/outlet-services/'.$override->id.'/update', [
                'active' => '0',
                'price_override_amount' => 9900,
                'sla_override' => '36 jam',
            ])
            ->assertRedirect(route('tenant.outlet-services.index', ['tenant' => $tenant]));

        $this->assertDatabaseHas('outlet_services', [
            'id' => $override->id,
            'outlet_id' => $this->outletA->id,
            'service_id' => $this->service->id,
            'active' => false,
            'price_override_amount' => 9900,
            'sla_override' => '36 jam',
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'OUTLET_SERVICE_OVERRIDE_UPSERTED',
            'channel' => 'web',
            'entity_type' => 'outlet_service',
            'entity_id' => $override->id,
        ]);

        $this->assertDatabaseHas('audit_events', [
            'tenant_id' => $tenant,
            'user_id' => $this->admin->id,
            'event_key' => 'OUTLET_SERVICE_OVERRIDE_UPDATED',
            'channel' => 'web',
            'entity_type' => 'outlet_service',
            'entity_id' => $override->id,
        ]);
    }

    public function test_admin_cannot_upsert_outlet_service_override_for_out_of_scope_outlet(): void
    {
        $tenant = $this->tenantA->id;

        $this->actingAs($this->admin, 'web')
            ->from('/t/'.$tenant.'/outlet-services')
            ->post('/t/'.$tenant.'/outlet-services/upsert', [
                'outlet_id' => $this->outletB->id,
                'service_id' => $this->service->id,
                'price_override_amount' => 9100,
            ])
            ->assertRedirect('/t/'.$tenant.'/outlet-services')
            ->assertSessionHasErrors('outlet_service');

        $this->assertDatabaseMissing('outlet_services', [
            'outlet_id' => $this->outletB->id,
            'service_id' => $this->service->id,
            'price_override_amount' => 9100,
        ]);
    }

    public function test_outlet_service_advanced_filters_by_service_status_and_override_price(): void
    {
        $inactiveService = Service::query()->create([
            'tenant_id' => $this->tenantA->id,
            'name' => 'Service Inactive Filter',
            'unit_type' => 'kg',
            'base_price_amount' => 11000,
            'active' => false,
        ]);

        $activeOverride = OutletService::query()->create([
            'outlet_id' => $this->outletA->id,
            'service_id' => $this->service->id,
            'active' => true,
            'price_override_amount' => 9600,
            'sla_override' => '24 jam',
        ]);

        $inactiveNoOverride = OutletService::query()->create([
            'outlet_id' => $this->outletA->id,
            'service_id' => $inactiveService->id,
            'active' => true,
            'price_override_amount' => null,
            'sla_override' => null,
        ]);

        $this->actingAs($this->admin, 'web')
            ->get('/t/'.$this->tenantA->id.'/outlet-services?service_active=0&override_price=none')
            ->assertOk()
            ->assertViewHas('rows', function ($rows) use ($inactiveNoOverride): bool {
                return $rows->count() === 1
                    && (string) optional($rows->first())->id === (string) $inactiveNoOverride->id;
            })
            ->assertSeeText('Status Layanan')
            ->assertSeeText('Tanpa Override');

        $this->assertDatabaseHas('outlet_services', [
            'id' => $activeOverride->id,
            'outlet_id' => $this->outletA->id,
            'service_id' => $this->service->id,
        ]);
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
