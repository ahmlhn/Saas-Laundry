<?php

namespace Tests\Feature;

use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MasterDataBillingApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outletA;

    private Outlet $outletB;

    private Service $serviceKg;

    private User $owner;

    private User $ownerTwo;

    private User $admin;

    private User $cashier;

    private User $worker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $plan = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant Master Data',
            'current_plan_id' => $plan->id,
            'status' => 'active',
        ]);

        $this->outletA = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet A',
            'code' => 'MDA',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Alamat A',
        ]);

        $this->outletB = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet B',
            'code' => 'MDB',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Alamat B',
        ]);

        $this->serviceKg = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan Reguler',
            'unit_type' => 'kg',
            'base_price_amount' => 8000,
            'active' => true,
        ]);

        OutletService::query()->create([
            'outlet_id' => $this->outletA->id,
            'service_id' => $this->serviceKg->id,
            'active' => true,
            'price_override_amount' => 9000,
        ]);

        $this->owner = $this->createUserWithRole('owner@master.local', 'owner', [$this->outletA->id, $this->outletB->id]);
        $this->ownerTwo = $this->createUserWithRole('owner2@master.local', 'owner', [$this->outletA->id, $this->outletB->id]);
        $this->admin = $this->createUserWithRole('admin@master.local', 'admin', [$this->outletA->id]);
        $this->cashier = $this->createUserWithRole('cashier@master.local', 'cashier', [$this->outletA->id]);
        $this->worker = $this->createUserWithRole('worker@master.local', 'worker', [$this->outletA->id]);
    }

    public function test_get_allowed_outlets_returns_user_assigned_outlets(): void
    {
        $this->apiAs($this->admin)
            ->getJson('/api/outlets/allowed')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->outletA->id);

        $this->apiAs($this->owner)
            ->getJson('/api/outlets/allowed')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_customer_endpoints_support_create_list_update(): void
    {
        $create = $this->apiAs($this->cashier)
            ->postJson('/api/customers', [
                'name' => 'Pelanggan Satu',
                'phone' => '0812 3456 7890',
                'notes' => 'Catatan awal',
            ]);

        $create->assertCreated()
            ->assertJsonPath('data.phone_normalized', '6281234567890');

        $customerId = $create->json('data.id');

        $this->apiAs($this->cashier)
            ->getJson('/api/customers?q=Pelanggan')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $customerId);

        $this->apiAs($this->cashier)
            ->patchJson('/api/customers/'.$customerId, [
                'name' => 'Pelanggan Updated',
                'notes' => 'Catatan baru',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Pelanggan Updated');

        $this->apiAs($this->worker)
            ->postJson('/api/customers', [
                'name' => 'Not Allowed',
                'phone' => '081200000000',
            ])
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');
    }

    public function test_customer_lifecycle_archive_and_restore_requires_owner_or_admin(): void
    {
        $create = $this->apiAs($this->cashier)->postJson('/api/customers', [
            'name' => 'Lifecycle Customer',
            'phone' => '081233334444',
        ])->assertCreated();

        $customerId = $create->json('data.id');

        $this->apiAs($this->cashier)
            ->deleteJson('/api/customers/'.$customerId)
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $this->apiAs($this->admin)
            ->deleteJson('/api/customers/'.$customerId)
            ->assertOk()
            ->assertJsonPath('data.id', $customerId);

        $this->assertSoftDeleted('customers', [
            'id' => $customerId,
            'tenant_id' => $this->tenant->id,
        ]);

        $this->apiAs($this->cashier)
            ->getJson('/api/customers?q=Lifecycle')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->apiAs($this->admin)
            ->getJson('/api/customers?include_deleted=1&q=Lifecycle')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $customerId);

        $this->apiAs($this->admin)
            ->postJson('/api/customers/'.$customerId.'/restore')
            ->assertOk()
            ->assertJsonPath('data.id', $customerId);

        $this->assertDatabaseHas('customers', [
            'id' => $customerId,
            'tenant_id' => $this->tenant->id,
            'deleted_at' => null,
        ]);
    }

    public function test_services_and_outlet_services_endpoints_work_with_role_guards(): void
    {
        $this->apiAs($this->cashier)
            ->getJson('/api/services?outlet_id='.$this->outletA->id)
            ->assertOk()
            ->assertJsonPath('data.0.id', $this->serviceKg->id)
            ->assertJsonPath('data.0.effective_price_amount', 9000);

        $outletServiceId = OutletService::query()->where('outlet_id', $this->outletA->id)->value('id');

        $this->apiAs($this->admin)
            ->patchJson('/api/outlet-services/'.$outletServiceId, [
                'price_override_amount' => 9500,
            ])
            ->assertOk()
            ->assertJsonPath('data.price_override_amount', 9500);

        $this->apiAs($this->cashier)
            ->patchJson('/api/outlet-services/'.$outletServiceId, [
                'price_override_amount' => 9900,
            ])
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');
    }

    public function test_service_lifecycle_archive_restore_and_include_deleted_filter(): void
    {
        $this->apiAs($this->cashier)
            ->deleteJson('/api/services/'.$this->serviceKg->id)
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $this->apiAs($this->admin)
            ->deleteJson('/api/services/'.$this->serviceKg->id)
            ->assertOk()
            ->assertJsonPath('data.id', $this->serviceKg->id);

        $this->assertSoftDeleted('services', [
            'id' => $this->serviceKg->id,
            'tenant_id' => $this->tenant->id,
        ]);

        $this->apiAs($this->cashier)
            ->getJson('/api/services')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->apiAs($this->admin)
            ->getJson('/api/services?include_deleted=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->serviceKg->id)
            ->assertJsonPath('data.0.deleted_at', Service::withTrashed()->findOrFail($this->serviceKg->id)->deleted_at?->toIso8601String());

        $this->apiAs($this->admin)
            ->postJson('/api/services/'.$this->serviceKg->id.'/restore')
            ->assertOk()
            ->assertJsonPath('data.id', $this->serviceKg->id);

        $this->assertDatabaseHas('services', [
            'id' => $this->serviceKg->id,
            'tenant_id' => $this->tenant->id,
            'deleted_at' => null,
        ]);
    }

    public function test_outlet_lifecycle_owner_only_and_last_active_outlet_guard(): void
    {
        $this->apiAs($this->admin)
            ->deleteJson('/api/outlets/'.$this->outletA->id)
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $this->apiAs($this->owner)
            ->deleteJson('/api/outlets/'.$this->outletB->id)
            ->assertOk()
            ->assertJsonPath('data.id', $this->outletB->id);

        $this->assertSoftDeleted('outlets', [
            'id' => $this->outletB->id,
            'tenant_id' => $this->tenant->id,
        ]);

        $this->apiAs($this->owner)
            ->deleteJson('/api/outlets/'.$this->outletA->id)
            ->assertStatus(422)
            ->assertJsonPath('reason_code', 'VALIDATION_FAILED');

        $this->apiAs($this->owner)
            ->postJson('/api/outlets/'.$this->outletB->id.'/restore')
            ->assertOk()
            ->assertJsonPath('data.id', $this->outletB->id);
    }

    public function test_outlet_list_endpoint_supports_scope_and_include_deleted_policy(): void
    {
        $this->apiAs($this->cashier)
            ->getJson('/api/outlets')
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $this->apiAs($this->admin)
            ->getJson('/api/outlets')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->outletA->id);

        $this->apiAs($this->owner)
            ->getJson('/api/outlets?q=Outlet')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->apiAs($this->owner)
            ->deleteJson('/api/outlets/'.$this->outletB->id)
            ->assertOk()
            ->assertJsonPath('data.id', $this->outletB->id);

        $this->apiAs($this->admin)
            ->getJson('/api/outlets')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->outletA->id);

        $this->apiAs($this->admin)
            ->getJson('/api/outlets?include_deleted=1')
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $includeDeletedResponse = $this->apiAs($this->owner)
            ->getJson('/api/outlets?include_deleted=1')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $archivedOutlet = collect($includeDeletedResponse->json('data'))->firstWhere('id', $this->outletB->id);
        $this->assertNotNull($archivedOutlet);
        $this->assertNotNull($archivedOutlet['deleted_at']);
    }

    public function test_user_lifecycle_owner_only_with_self_archive_guard(): void
    {
        $this->apiAs($this->admin)
            ->deleteJson('/api/users/'.$this->cashier->id)
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $this->apiAs($this->owner)
            ->deleteJson('/api/users/'.$this->owner->id)
            ->assertStatus(422)
            ->assertJsonPath('reason_code', 'VALIDATION_FAILED');

        $this->apiAs($this->owner)
            ->deleteJson('/api/users/'.$this->cashier->id)
            ->assertOk()
            ->assertJsonPath('data.id', $this->cashier->id);

        $this->assertSoftDeleted('users', [
            'id' => $this->cashier->id,
            'tenant_id' => $this->tenant->id,
        ]);

        $this->apiAs($this->owner)
            ->postJson('/api/users/'.$this->cashier->id.'/restore')
            ->assertOk()
            ->assertJsonPath('data.id', $this->cashier->id);

        $this->assertDatabaseHas('users', [
            'id' => $this->cashier->id,
            'tenant_id' => $this->tenant->id,
            'deleted_at' => null,
        ]);
    }

    public function test_user_list_endpoint_supports_search_and_include_deleted(): void
    {
        $this->apiAs($this->cashier)
            ->getJson('/api/users')
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');

        $searchResponse = $this->apiAs($this->admin)
            ->getJson('/api/users?q=owner')
            ->assertOk();

        $this->assertNotNull(collect($searchResponse->json('data'))->firstWhere('email', 'owner@master.local'));
        $this->assertNotNull(collect($searchResponse->json('data'))->firstWhere('email', 'owner2@master.local'));

        $this->apiAs($this->owner)
            ->deleteJson('/api/users/'.$this->cashier->id)
            ->assertOk()
            ->assertJsonPath('data.id', $this->cashier->id);

        $this->apiAs($this->admin)
            ->getJson('/api/users')
            ->assertOk()
            ->assertJsonCount(4, 'data');

        $includeDeletedResponse = $this->apiAs($this->admin)
            ->getJson('/api/users?include_deleted=1')
            ->assertOk()
            ->assertJsonCount(5, 'data');

        $archivedCashier = collect($includeDeletedResponse->json('data'))->firstWhere('id', $this->cashier->id);

        $this->assertNotNull($archivedCashier);
        $this->assertNotNull($archivedCashier['deleted_at']);
    }

    public function test_shipping_zone_endpoints_support_create_and_list(): void
    {
        $create = $this->apiAs($this->admin)
            ->postJson('/api/shipping-zones', [
                'outlet_id' => $this->outletA->id,
                'name' => 'Zona 1',
                'min_distance_km' => 0,
                'max_distance_km' => 5,
                'fee_amount' => 10000,
                'eta_minutes' => 30,
            ]);

        $create->assertCreated()
            ->assertJsonPath('data.name', 'Zona 1');

        $this->assertDatabaseHas('shipping_zones', [
            'tenant_id' => $this->tenant->id,
            'outlet_id' => $this->outletA->id,
            'name' => 'Zona 1',
            'fee_amount' => 10000,
        ]);

        $this->apiAs($this->admin)
            ->getJson('/api/shipping-zones?outlet_id='.$this->outletA->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Zona 1');
    }

    public function test_billing_quota_endpoint_returns_snapshot_and_restricts_role(): void
    {
        $period = now()->format('Y-m');

        TenantSubscription::query()->create([
            'tenant_id' => $this->tenant->id,
            'plan_id' => $this->tenant->current_plan_id,
            'period' => $period,
            'starts_at' => now()->startOfMonth(),
            'ends_at' => now()->endOfMonth(),
            'status' => 'active',
        ]);

        QuotaUsage::query()->create([
            'tenant_id' => $this->tenant->id,
            'period' => $period,
            'orders_used' => 10,
        ]);

        $this->apiAs($this->admin)
            ->getJson('/api/billing/quota?period='.$period)
            ->assertOk()
            ->assertJsonPath('data.quota.orders_used', 10)
            ->assertJsonPath('data.subscription.period', $period);

        $this->apiAs($this->cashier)
            ->getJson('/api/billing/quota')
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');
    }

    private function createUserWithRole(string $email, string $roleKey, array $outletIds): User
    {
        $role = Role::query()->where('key', $roleKey)->firstOrFail();

        $user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => $email,
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $user->roles()->syncWithoutDetaching([$role->id]);
        $user->outlets()->syncWithoutDetaching($outletIds);

        return $user;
    }

    private function apiAs(User $user): self
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user, 'sanctum');
    }
}
