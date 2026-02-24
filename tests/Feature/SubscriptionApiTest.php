<?php

namespace Tests\Feature;

use App\Models\Outlet;
use App\Models\Plan;
use App\Models\QuotaUsageCycle;
use App\Models\Role;
use App\Models\Service;
use App\Models\SubscriptionCycle;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentEvent;
use App\Models\SubscriptionPaymentProof;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
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

    private SubscriptionInvoice $qrisInvoice;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config([
            'subscription.bri.webhook_secret' => 'test-bri-secret',
            'subscription.billing_gateway_provider' => 'bri_qris',
        ]);

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

        $this->qrisInvoice = SubscriptionInvoice::query()->create([
            'tenant_id' => $this->tenant->id,
            'cycle_id' => $this->cycle->id,
            'invoice_no' => 'SUB-TEST-QRIS-001',
            'amount_total' => 199000,
            'currency' => 'IDR',
            'tax_included' => true,
            'payment_method' => 'bri_qris',
            'gateway_provider' => 'bri_qris',
            'issued_at' => now()->subHours(6),
            'due_at' => now()->addDay(),
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

    public function test_proof_upload_is_rejected_for_bri_qris_invoice(): void
    {
        $this->apiAs($this->owner)
            ->withHeader('Accept', 'application/json')
            ->post('/api/subscriptions/invoices/'.$this->qrisInvoice->id.'/proof', [
                'proof_file' => UploadedFile::fake()->create('proof.jpg', 120, 'image/jpeg'),
            ])
            ->assertStatus(422)
            ->assertJsonPath('reason_code', 'LEGACY_PROOF_ONLY');
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

    public function test_platform_manual_verify_rejects_bri_qris_invoice(): void
    {
        $this->apiAs($this->platformOwner)
            ->postJson('/api/platform/subscriptions/invoices/'.$this->qrisInvoice->id.'/verify', [
                'decision' => 'approve',
            ])
            ->assertStatus(422)
            ->assertJsonPath('reason_code', 'AUTO_VERIFIED_GATEWAY');
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

    public function test_owner_can_create_qris_intent_for_gateway_invoice(): void
    {
        $this->apiAs($this->owner)
            ->postJson('/api/subscriptions/invoices/'.$this->qrisInvoice->id.'/qris-intent')
            ->assertCreated()
            ->assertJsonPath('data.invoice.payment_method', 'bri_qris')
            ->assertJsonPath('data.intent.provider', 'bri_qris')
            ->assertJsonPath('data.intent.invoice_id', $this->qrisInvoice->id);

        $this->assertDatabaseHas('subscription_payment_intents', [
            'invoice_id' => $this->qrisInvoice->id,
            'provider' => 'bri_qris',
            'status' => 'ready',
        ]);

        $this->apiAs($this->owner)
            ->getJson('/api/subscriptions/invoices/'.$this->qrisInvoice->id.'/payment-status')
            ->assertOk()
            ->assertJsonPath('data.invoice.id', $this->qrisInvoice->id)
            ->assertJsonPath('data.latest_intent.invoice_id', $this->qrisInvoice->id);
    }

    public function test_valid_bri_webhook_marks_invoice_paid_and_reactivates_tenant(): void
    {
        $this->tenant->forceFill([
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ])->save();

        $payload = [
            'event_id' => 'evt-valid-001',
            'event_type' => 'qris.paid',
            'status' => 'paid',
            'invoice_id' => $this->qrisInvoice->id,
            'invoice_no' => $this->qrisInvoice->invoice_no,
            'amount_total' => (int) $this->qrisInvoice->amount_total,
            'currency' => 'IDR',
            'gateway_reference' => 'BRI-REF-001',
        ];

        $this->postBriWebhook($payload)
            ->assertStatus(202)
            ->assertJsonPath('event.process_status', 'accepted');

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $this->qrisInvoice->id,
            'status' => 'paid',
            'gateway_status' => 'paid',
            'gateway_reference' => 'BRI-REF-001',
        ]);

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ]);
    }

    public function test_duplicate_webhook_is_idempotent(): void
    {
        $payload = [
            'event_id' => 'evt-dup-001',
            'event_type' => 'qris.paid',
            'status' => 'paid',
            'invoice_id' => $this->qrisInvoice->id,
            'invoice_no' => $this->qrisInvoice->invoice_no,
            'amount_total' => (int) $this->qrisInvoice->amount_total,
            'currency' => 'IDR',
            'gateway_reference' => 'BRI-REF-DUP',
        ];

        $this->postBriWebhook($payload)->assertStatus(202);
        $this->postBriWebhook($payload)
            ->assertStatus(202)
            ->assertJsonPath('duplicate', true);

        $this->assertDatabaseCount('subscription_payment_events', 1);
        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $this->qrisInvoice->id,
            'status' => 'paid',
        ]);
    }

    public function test_webhook_with_invalid_signature_is_rejected(): void
    {
        $payload = [
            'event_id' => 'evt-invalid-signature',
            'event_type' => 'qris.paid',
            'status' => 'paid',
            'invoice_id' => $this->qrisInvoice->id,
            'invoice_no' => $this->qrisInvoice->invoice_no,
            'amount_total' => (int) $this->qrisInvoice->amount_total,
            'currency' => 'IDR',
        ];

        $this->postBriWebhook($payload, 'broken-signature')
            ->assertStatus(202)
            ->assertJsonPath('event.process_status', 'rejected')
            ->assertJsonPath('event.rejection_reason', 'invalid_signature');

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $this->qrisInvoice->id,
            'status' => 'issued',
        ]);
    }

    public function test_webhook_amount_mismatch_keeps_invoice_unpaid(): void
    {
        $this->tenant->forceFill([
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ])->save();

        $payload = [
            'event_id' => 'evt-mismatch-001',
            'event_type' => 'qris.paid',
            'status' => 'paid',
            'invoice_id' => $this->qrisInvoice->id,
            'invoice_no' => $this->qrisInvoice->invoice_no,
            'amount_total' => (int) $this->qrisInvoice->amount_total + 1,
            'currency' => 'IDR',
            'gateway_reference' => 'BRI-REF-MISMATCH',
        ];

        $this->postBriWebhook($payload)
            ->assertStatus(202)
            ->assertJsonPath('event.process_status', 'amount_mismatch');

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $this->qrisInvoice->id,
            'status' => 'issued',
            'gateway_status' => 'amount_mismatch',
        ]);

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ]);
    }

    public function test_enforce_status_applies_h_plus_one_suspend_and_paid_webhook_reactivates(): void
    {
        $this->qrisInvoice->forceFill([
            'due_at' => now()->subDays(2),
            'status' => 'issued',
        ])->save();

        $this->artisan('ops:subscription:enforce-status')
            ->assertSuccessful();

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ]);

        $payload = [
            'event_id' => 'evt-reactivate-001',
            'event_type' => 'qris.paid',
            'status' => 'paid',
            'invoice_id' => $this->qrisInvoice->id,
            'invoice_no' => $this->qrisInvoice->invoice_no,
            'amount_total' => (int) $this->qrisInvoice->amount_total,
            'currency' => 'IDR',
            'gateway_reference' => 'BRI-REF-REACTIVE',
        ];

        $this->postBriWebhook($payload)
            ->assertStatus(202)
            ->assertJsonPath('event.process_status', 'accepted');

        $this->assertDatabaseHas('tenants', [
            'id' => $this->tenant->id,
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ]);
    }

    public function test_platform_can_fetch_gateway_payment_events_log(): void
    {
        $payload = [
            'event_id' => 'evt-platform-log-001',
            'event_type' => 'qris.paid',
            'status' => 'paid',
            'invoice_id' => $this->qrisInvoice->id,
            'invoice_no' => $this->qrisInvoice->invoice_no,
            'amount_total' => (int) $this->qrisInvoice->amount_total,
            'currency' => 'IDR',
            'gateway_reference' => 'BRI-REF-LOG',
        ];
        $this->postBriWebhook($payload)->assertStatus(202);

        $this->apiAs($this->platformOwner)
            ->getJson('/api/platform/subscriptions/payments/events?tenant_id='.$this->tenant->id)
            ->assertOk()
            ->assertJsonPath('data.0.gateway_event_id', 'evt-platform-log-001')
            ->assertJsonPath('data.0.tenant.id', $this->tenant->id)
            ->assertJsonPath('data.0.invoice.id', $this->qrisInvoice->id);
    }

    public function test_reconcile_payments_command_marks_invoice_paid_from_gateway_event(): void
    {
        SubscriptionPaymentEvent::query()->create([
            'invoice_id' => $this->qrisInvoice->id,
            'tenant_id' => $this->tenant->id,
            'provider' => 'bri_qris',
            'gateway_event_id' => 'evt-reconcile-001',
            'event_type' => 'qris.paid',
            'event_status' => 'paid',
            'amount_total' => (int) $this->qrisInvoice->amount_total,
            'currency' => 'IDR',
            'gateway_reference' => 'BRI-REF-REC',
            'signature_valid' => true,
            'process_status' => 'accepted',
            'payload_json' => ['event_id' => 'evt-reconcile-001'],
            'received_at' => now(),
            'processed_at' => now(),
        ]);

        $this->artisan('ops:subscription:reconcile-payments', [
            '--tenant' => $this->tenant->id,
        ])->assertSuccessful();

        $this->assertDatabaseHas('subscription_invoices', [
            'id' => $this->qrisInvoice->id,
            'status' => 'paid',
            'gateway_status' => 'paid',
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

    private function postBriWebhook(array $payload, ?string $signature = null): TestResponse
    {
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $resolvedSignature = $signature ?? $this->briSignature($raw);

        return $this->call(
            'POST',
            '/api/payments/bri/qris/webhook',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_BRI_SIGNATURE' => $resolvedSignature,
            ],
            $raw
        );
    }

    private function briSignature(string $rawPayload): string
    {
        return hash_hmac('sha256', $rawPayload, 'test-bri-secret');
    }
}
