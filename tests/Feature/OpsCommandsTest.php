<?php

namespace Tests\Feature;

use App\Jobs\SendWaMessageJob;
use App\Models\AuditEvent;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Outlet;
use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Tenant;
use App\Models\WaMessage;
use App\Models\WaProvider;
use App\Models\WaProviderConfig;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OpsCommandsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $plan = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Ops Tenant',
            'current_plan_id' => $plan->id,
            'status' => 'active',
        ]);
    }

    public function test_archive_audit_command_archives_and_deletes_old_rows(): void
    {
        Storage::fake('local');

        $oldEvent = AuditEvent::query()->create([
            'tenant_id' => $this->tenant->id,
            'event_key' => 'AUTH_LOGIN_FAILED',
            'channel' => 'api',
            'metadata_json' => ['x' => 1],
        ]);

        $oldEvent->forceFill([
            'created_at' => now()->subDays(100),
            'updated_at' => now()->subDays(100),
        ])->save();

        $newEvent = AuditEvent::query()->create([
            'tenant_id' => $this->tenant->id,
            'event_key' => 'ORDER_CREATED',
            'channel' => 'api',
            'metadata_json' => ['x' => 2],
        ]);

        $newEvent->forceFill([
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ])->save();

        $this->artisan('ops:audit:archive', ['--days' => 90])
            ->assertSuccessful();

        $this->assertDatabaseCount('audit_events', 1);

        $files = Storage::disk('local')->files('audit-archives');
        $this->assertNotEmpty($files);
        Storage::disk('local')->assertExists($files[0]);
    }

    public function test_redrive_failed_wa_messages_requeues_and_dispatches_jobs(): void
    {
        Queue::fake();

        $provider = WaProvider::query()->where('key', 'mock')->firstOrFail();

        $target = WaMessage::query()->create([
            'tenant_id' => $this->tenant->id,
            'provider_id' => $provider->id,
            'template_id' => 'WA_ORDER_DONE',
            'idempotency_key' => $this->tenant->id.':ops:1:WA_ORDER_DONE',
            'to_phone' => '6281234567890',
            'body_text' => 'test',
            'status' => 'failed',
            'attempts' => 5,
            'last_error_code' => 'NETWORK_ERROR',
            'last_error_message' => 'network timeout',
            'metadata_json' => [],
        ]);

        WaMessage::query()->create([
            'tenant_id' => $this->tenant->id,
            'provider_id' => $provider->id,
            'template_id' => 'WA_ORDER_DONE',
            'idempotency_key' => $this->tenant->id.':ops:2:WA_ORDER_DONE',
            'to_phone' => '6281234567890',
            'body_text' => 'test-2',
            'status' => 'failed',
            'attempts' => 2,
            'last_error_code' => 'PHONE_INVALID',
            'last_error_message' => 'invalid',
            'metadata_json' => [],
        ]);

        $this->artisan('ops:wa:redrive-failed', [
            '--tenant' => $this->tenant->id,
            '--limit' => 50,
        ])->assertSuccessful();

        $this->assertDatabaseHas('wa_messages', [
            'id' => $target->id,
            'status' => 'queued',
            'attempts' => 0,
            'last_error_code' => null,
        ]);

        Queue::assertPushed(SendWaMessageJob::class, 1);

        $this->assertDatabaseHas('wa_messages', [
            'idempotency_key' => $this->tenant->id.':ops:2:WA_ORDER_DONE',
            'status' => 'failed',
            'last_error_code' => 'PHONE_INVALID',
        ]);
    }

    public function test_send_aging_wa_reminders_command_creates_billing_reminder_messages(): void
    {
        $premiumPlan = Plan::query()->where('key', 'premium')->firstOrFail();
        $provider = WaProvider::query()->where('key', 'mock')->firstOrFail();

        $this->tenant->forceFill([
            'current_plan_id' => $premiumPlan->id,
        ])->save();

        $outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Ops Outlet Aging',
            'code' => 'OPA',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Ops Aging',
        ]);

        $customer = Customer::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Ops Customer Aging',
            'phone_normalized' => '6281000000009',
        ]);

        WaProviderConfig::query()->create([
            'tenant_id' => $this->tenant->id,
            'provider_id' => $provider->id,
            'credentials_json' => ['token' => 'ops-aging-token'],
            'is_active' => true,
        ]);

        $order = Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'outlet_id' => $outlet->id,
            'customer_id' => $customer->id,
            'invoice_no' => 'INV-OPS-AGING-001',
            'order_code' => 'ORD-OPS-AGING-001',
            'is_pickup_delivery' => false,
            'laundry_status' => 'completed',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 22000,
            'paid_amount' => 0,
            'due_amount' => 22000,
            'collection_status' => 'pending',
        ]);
        $order->timestamps = false;
        $order->forceFill([
            'created_at' => now()->subDays(9),
            'updated_at' => now()->subDays(9),
        ])->save();

        $this->artisan('ops:wa:send-aging-reminders', [
            '--tenant' => $this->tenant->id,
            '--bucket' => ['d8_14'],
            '--as-of' => now()->format('Y-m-d'),
            '--limit' => 50,
        ])->assertSuccessful();

        $this->assertDatabaseHas('wa_messages', [
            'tenant_id' => $this->tenant->id,
            'order_id' => $order->id,
            'template_id' => 'WA_BILLING_REMINDER',
        ]);
    }

    public function test_reconcile_quota_usage_rebuilds_period_usage(): void
    {
        Order::query()->create([
            'tenant_id' => $this->tenant->id,
            'outlet_id' => \App\Models\Outlet::query()->create([
                'tenant_id' => $this->tenant->id,
                'name' => 'Ops Outlet',
                'code' => 'OPS',
                'timezone' => 'Asia/Jakarta',
                'address' => 'Ops Addr',
            ])->id,
            'customer_id' => \App\Models\Customer::query()->create([
                'tenant_id' => $this->tenant->id,
                'name' => 'Ops Customer',
                'phone_normalized' => '6281000000001',
            ])->id,
            'invoice_no' => null,
            'order_code' => 'ORD-OPS-001',
            'is_pickup_delivery' => false,
            'laundry_status' => 'received',
            'courier_status' => null,
            'shipping_fee_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 12000,
            'paid_amount' => 0,
            'due_amount' => 12000,
            'created_at' => now()->startOfMonth()->addDay(),
            'updated_at' => now()->startOfMonth()->addDay(),
        ]);

        QuotaUsage::query()->create([
            'tenant_id' => $this->tenant->id,
            'period' => now()->format('Y-m'),
            'orders_used' => 99,
        ]);

        $this->artisan('ops:quota:reconcile', [
            'period' => now()->format('Y-m'),
            '--tenant' => $this->tenant->id,
        ])->assertSuccessful();

        $this->assertDatabaseHas('quota_usage', [
            'tenant_id' => $this->tenant->id,
            'period' => now()->format('Y-m'),
            'orders_used' => 1,
        ]);
    }

    public function test_readiness_check_succeeds_without_strict_even_when_warning_exists(): void
    {
        config(['queue.default' => 'sync']);

        $exitCode = Artisan::call('ops:readiness:check', [
            '--json' => true,
        ]);

        $this->assertSame(0, $exitCode);

        $report = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertIsArray($report);
        $this->assertArrayHasKey('checks', $report);
        $this->assertArrayHasKey('summary', $report);
        $this->assertSame(0, (int) ($report['summary']['fail'] ?? 0));

        $queueCheck = collect($report['checks'])->firstWhere('key', 'queue.connection.mode');
        $this->assertNotNull($queueCheck);
        $this->assertSame('warn', $queueCheck['status']);
    }

    public function test_observability_health_command_outputs_json_report(): void
    {
        $exitCode = Artisan::call('ops:observe:health', [
            '--json' => true,
            '--lookback-minutes' => 15,
            '--period' => now()->format('Y-m'),
        ]);

        $this->assertSame(0, $exitCode);

        $report = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertIsArray($report);
        $this->assertArrayHasKey('checks', $report);
        $this->assertArrayHasKey('summary', $report);
        $this->assertArrayHasKey('generated_at', $report);
    }

    public function test_readiness_check_strict_fails_when_warning_exists(): void
    {
        config(['queue.default' => 'sync']);

        $exitCode = Artisan::call('ops:readiness:check', [
            '--json' => true,
            '--strict' => true,
        ]);

        $this->assertSame(1, $exitCode);

        $report = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertIsArray($report);
        $this->assertArrayHasKey('summary', $report);
        $this->assertGreaterThanOrEqual(1, (int) ($report['summary']['warn'] ?? 0));
    }

    public function test_uat_run_dry_run_generates_report_file(): void
    {
        $relativePath = 'storage/app/uat-reports/uat-test-dryrun.md';
        $absolutePath = base_path($relativePath);

        if (file_exists($absolutePath)) {
            unlink($absolutePath);
        }

        $this->artisan('ops:uat:run', [
            '--dry-run' => true,
            '--date' => '2026-02-16',
            '--environment' => 'testing',
            '--output' => $relativePath,
        ])->assertSuccessful();

        $this->assertFileExists($absolutePath);

        $content = (string) file_get_contents($absolutePath);
        $this->assertStringContainsString('Overall status: `BLOCKED`', $content);
        $this->assertStringContainsString('| UAT-01 | Kasir | Blocked |', $content);
        $this->assertStringContainsString('| UAT-10 | Semua role | Blocked |', $content);
    }

    public function test_uat_run_rejects_invalid_date_format(): void
    {
        $this->artisan('ops:uat:run', [
            '--dry-run' => true,
            '--date' => '2026/02/16',
        ])->assertFailed();
    }
}
