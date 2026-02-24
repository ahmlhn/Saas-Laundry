<?php

namespace Tests\Feature;

use App\Models\Outlet;
use App\Models\Plan;
use App\Models\QuotaUsageCycle;
use App\Models\Role;
use App\Models\Service;
use App\Models\SubscriptionCycle;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentProof;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SubscriptionApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outlet;

    private Service $service;

    private User $owner;

    private User $admin;

    private User $cashier;

    private User $platformOwner;

    private SubscriptionCycle $cycle;

    private SubscriptionInvoice $invoice;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');

        $this->seed(RolesAndPlansSeeder::class);

        $standard = Plan::query()->where('key', 'standard')->firstOrFail();
        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant Subscription Test',
            'current_plan_id' => $standard->id,
            'status' => 'active',
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ]);

        $this->outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet Sub',
            'code' => 'SUBT',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Jl. Sub Test',
        ]);

        $this->service = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan',
            'unit_type' => 'kg',
            'base_price_amount' => 10000,
            'active' => true,
        ]);

        $this->owner = $this->createTenantUser('owner@subs.test', 'owner');
        $this->admin = $this->createTenantUser('admin@subs.test', 'admin');
        $this->cashier = $this->createTenantUser('cashier@subs.test', 'cashier');
        $this->platformOwner = $this->createPlatformUser('platform.owner@subs.test', 'platform_owner');

        $this->cycle = SubscriptionCycle::query()->create([
            'tenant_id' => $this->tenant->id,
            'plan_id' => $standard->id,
            'orders_limit_snapshot' => $standard->orders_limit,
            'status' => 'active',
            'cycle_start_at' => now()->subDays(3),
            'cycle_end_at' => now()->addDays(27),
            'activated_at' => now()->subDays(3),
            'auto_renew' => true,
            'source' => 'test',
        ]);

        QuotaUsageCycle::query()->create([
            'tenant_id' => $this->tenant->id,
            'cycle_id' => $this->cycle->id,
            'orders_limit_snapshot' => $standard->orders_limit,
            'orders_used' => 0,
        ]);

        $this->tenant->forceFill([
            'current_subscription_cycle_id' => $this->cycle->id,
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ])->save();

        $this->invoice = SubscriptionInvoice::query()->create([
            'tenant_id' => $this->tenant->id,
            'cycle_id' => $this->cycle->id,
            'invoice_no' => 'SUB-TEST-001',
            'amount_total' => 149000,
            'currency' => 'IDR',
            'tax_included' => true,
            'payment_method' => 'bank_transfer',
            'issued_at' => now()->subDay(),
            'due_at' => now()->addDays(2),
            'status' => 'issued',
        ]);
    }

    public function test_owner_can_create_plan_change_request_and_admin_cannot(): void
    {
        $premium = Plan::query()->where('key', 'premium')->firstOrFail();

        $this->apiAs($this->owner)
            ->postJson('/api/subscriptions/change-request', [
                'target_plan_id' => $premium->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.target_plan.key', 'premium');

        $this->apiAs($this->admin)
            ->postJson('/api/subscriptions/change-request', [
                'target_plan_id' => $premium->id,
            ])
            ->assertStatus(403)
            ->assertJsonPath('reason_code', 'ROLE_ACCESS_DENIED');
    }

    public function test_owner_can_upload_subscription_proof_and_invalid_file_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->post('/api/subscriptions/invoices/'.$this->invoice->id.'/proof', [
                'proof_file' => UploadedFile::fake()->create('proof.jpg', 120, 'image/jpeg'),
            ])
            ->assertCreated()
            ->assertJsonPath('data.invoice.status', 'pending_verification');

        $this->assertDatabaseHas('subscription_payment_proofs', [
            'invoice_id' => $this->invoice->id,
            'tenant_id' => $this->tenant->id,
            'status' => 'submitted',
        ]);

        $this->apiAs($this->owner)
            ->withHeader('Accept', 'application/json')
            ->post('/api/subscriptions/invoices/'.$this->invoice->id.'/proof', [
                'proof_file' => UploadedFile::fake()->create('proof.txt', 10, 'text/plain'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['proof_file']);
    }

    public function test_platform_can_verify_invoice_and_restore_tenant_access(): void
    {
        $proof = SubscriptionPaymentProof::query()->create([
            'invoice_id' => $this->invoice->id,
            'tenant_id' => $this->tenant->id,
            'uploaded_by' => $this->owner->id,
            'file_path' => 'subscription-proofs/test.jpg',
            'file_name' => 'test.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 100,
            'status' => 'submitted',
        ]);

        $this->tenant->forceFill([
            'subscription_state' => 'past_due',
            'write_access_mode' => 'read_only',
        ])->save();

        $this->apiAs($this->platformOwner)
            ->postJson('/api/platform/subscriptions/invoices/'.$this->invoice->id.'/verify', [
                'decision' => 'approve',
            ])
            ->assertOk()
            ->assertJsonPath('data.invoice.status', 'paid')
            ->assertJsonPath('data.proof.status', 'approved');

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $this->invoice->id,
            'status' => 'paid',
        ]);

        $this->assertDatabaseHas('subscription_payment_proofs', [
            'id' => $proof->id,
            'status' => 'approved',
        ]);

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ]);
    }

    public function test_order_create_is_blocked_when_tenant_is_read_only(): void
    {
        $this->tenant->forceFill([
            'subscription_state' => 'past_due',
            'write_access_mode' => 'read_only',
        ])->save();

        $this->apiAs($this->cashier)
            ->postJson('/api/orders', [
                'outlet_id' => $this->outlet->id,
                'customer' => [
                    'name' => 'Cust A',
                    'phone' => '08123456789',
                ],
                'items' => [
                    [
                        'service_id' => $this->service->id,
                        'weight_kg' => 1.2,
                    ],
                ],
            ])
            ->assertStatus(423)
            ->assertJsonPath('reason_code', 'SUBSCRIPTION_READ_ONLY');
    }

    public function test_billing_quota_endpoint_keeps_compatibility_and_includes_subscription_fields(): void
    {
        $this->apiAs($this->owner)
            ->getJson('/api/billing/quota')
            ->assertOk()
            ->assertJsonPath('data.quota.plan', 'standard')
            ->assertJsonPath('data.quota.subscription_state', 'active')
            ->assertJsonPath('data.quota.write_access_mode', 'full')
            ->assertJsonStructure([
                'data' => [
                    'quota' => [
                        'period',
                        'orders_limit',
                        'orders_used',
                        'orders_remaining',
                        'can_create_order',
                        'cycle_start_at',
                        'cycle_end_at',
                    ],
                ],
            ]);
    }

    private function createTenantUser(string $email, string $roleKey): User
    {
        $role = Role::query()->where('key', $roleKey)->firstOrFail();
        $user = User::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => ucfirst($roleKey).' User',
            'phone' => '628888'.random_int(100000, 999999),
            'email' => $email,
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $user->roles()->syncWithoutDetaching([$role->id]);
        $user->outlets()->syncWithoutDetaching([$this->outlet->id]);

        return $user;
    }

    private function createPlatformUser(string $email, string $roleKey): User
    {
        $role = Role::query()->where('key', $roleKey)->firstOrFail();
        $user = User::query()->create([
            'tenant_id' => null,
            'name' => 'Platform User',
            'phone' => null,
            'email' => $email,
            'status' => 'active',
            'password' => Hash::make('password'),
        ]);

        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user;
    }

    private function apiAs(User $user): self
    {
        return $this->actingAs($user, 'sanctum');
    }
}
