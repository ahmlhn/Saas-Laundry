<?php

namespace Tests\Feature;

use App\Filament\Platform\Pages\PlatformSubscriptions;
use App\Filament\Platform\Pages\PlatformTenantSubscription;
use App\Models\Plan;
use App\Models\Role;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentProof;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PlatformSubscriptionsWebTest extends TestCase
{
    use RefreshDatabase;

    private User $platformOwner;

    private User $platformBilling;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $this->seed(RolesAndPlansSeeder::class);

        $plan = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant Platform Migration',
            'current_plan_id' => $plan->id,
            'status' => 'active',
            'subscription_state' => 'past_due',
            'write_access_mode' => 'read_only',
        ]);

        SubscriptionInvoice::query()->create([
            'tenant_id' => $this->tenant->id,
            'invoice_no' => 'INV-PLATFORM-001',
            'amount_total' => 125000,
            'currency' => 'IDR',
            'payment_method' => 'manual_transfer',
            'issued_at' => now()->subDay(),
            'due_at' => now()->addDay(),
            'status' => 'pending',
        ]);

        $this->platformOwner = $this->createPlatformUser('platform.owner@subscriptions.test', 'platform_owner');
        $this->platformBilling = $this->createPlatformUser('platform.billing@subscriptions.test', 'platform_billing');
    }

    public function test_platform_root_redirects_authenticated_platform_user_to_filament_panel(): void
    {
        $this->actingAs($this->platformOwner, 'web')
            ->get('/platform')
            ->assertRedirect(PlatformSubscriptions::getUrl(panel: 'platform'));
    }

    public function test_platform_owner_can_open_subscriptions_page_in_filament_panel(): void
    {
        $this->actingAs($this->platformOwner, 'web')
            ->get('/platform/subscriptions')
            ->assertOk()
            ->assertSeeText('Tenant subscriptions')
            ->assertSeeText('Tenant Platform Migration');
    }

    public function test_platform_owner_can_open_tenant_subscription_detail_in_filament_panel(): void
    {
        $this->actingAs($this->platformOwner, 'web')
            ->get('/platform/subscriptions/tenants/'.$this->tenant->slug)
            ->assertOk()
            ->assertSeeText('Tenant Platform Migration')
            ->assertSeeText('INV-PLATFORM-001')
            ->assertSee(PlatformTenantSubscription::getUrl(parameters: ['tenant' => $this->tenant], panel: 'platform'), false);
    }

    public function test_platform_owner_can_verify_invoice_via_web_compat_route(): void
    {
        $invoice = SubscriptionInvoice::query()->firstOrFail();

        SubscriptionPaymentProof::query()->create([
            'invoice_id' => $invoice->id,
            'tenant_id' => $this->tenant->id,
            'uploaded_by' => $this->platformOwner->id,
            'file_path' => 'subscription-proofs/platform-proof.jpg',
            'file_name' => 'platform-proof.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 120,
            'status' => 'submitted',
        ]);

        $this->actingAs($this->platformOwner, 'web')
            ->post('/platform/subscriptions/invoices/'.$invoice->id.'/verify', [
                'decision' => 'approve',
                'note' => 'Approved from compatibility route',
            ])
            ->assertRedirect(PlatformTenantSubscription::getUrl(parameters: ['tenant' => $this->tenant], panel: 'platform'));

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $invoice->id,
            'status' => 'paid',
            'verified_by' => $this->platformOwner->id,
        ]);

        $this->assertDatabaseHas('subscription_payment_proofs', [
            'invoice_id' => $invoice->id,
            'status' => 'approved',
            'reviewed_by' => $this->platformOwner->id,
        ]);

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ]);
    }

    public function test_platform_owner_can_suspend_and_activate_tenant_via_web_compat_routes(): void
    {
        $detailUrl = PlatformTenantSubscription::getUrl(parameters: ['tenant' => $this->tenant], panel: 'platform');

        $this->actingAs($this->platformOwner, 'web')
            ->post('/platform/subscriptions/tenants/'.$this->tenant->slug.'/suspend')
            ->assertRedirect($detailUrl);

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ]);

        $this->actingAs($this->platformOwner, 'web')
            ->post('/platform/subscriptions/tenants/'.$this->tenant->slug.'/activate')
            ->assertRedirect($detailUrl);

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ]);
    }

    public function test_platform_billing_can_verify_invoice_but_cannot_suspend_or_activate_tenant(): void
    {
        $invoice = SubscriptionInvoice::query()->firstOrFail();

        SubscriptionPaymentProof::query()->create([
            'invoice_id' => $invoice->id,
            'tenant_id' => $this->tenant->id,
            'uploaded_by' => $this->platformOwner->id,
            'file_path' => 'subscription-proofs/platform-proof-billing.jpg',
            'file_name' => 'platform-proof-billing.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 180,
            'status' => 'submitted',
        ]);

        $this->actingAs($this->platformBilling, 'web')
            ->post('/platform/subscriptions/invoices/'.$invoice->id.'/verify', [
                'decision' => 'approve',
            ])
            ->assertRedirect(PlatformTenantSubscription::getUrl(parameters: ['tenant' => $this->tenant], panel: 'platform'));

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $invoice->id,
            'status' => 'paid',
            'verified_by' => $this->platformBilling->id,
        ]);

        $this->actingAs($this->platformBilling, 'web')
            ->post('/platform/subscriptions/tenants/'.$this->tenant->slug.'/suspend')
            ->assertForbidden();

        $this->actingAs($this->platformBilling, 'web')
            ->post('/platform/subscriptions/tenants/'.$this->tenant->slug.'/activate')
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
