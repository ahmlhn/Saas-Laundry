<?php

namespace Tests\Feature;

use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Plan;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\RolesAndPlansSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SyncApiTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Outlet $outlet;

    private Service $kgService;

    private User $cashier;

    private User $worker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPlansSeeder::class);

        $plan = Plan::query()->where('key', 'standard')->firstOrFail();

        $this->tenant = Tenant::query()->create([
            'name' => 'Tenant Sync',
            'current_plan_id' => $plan->id,
            'status' => 'active',
        ]);

        $this->outlet = Outlet::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outlet Sync',
            'code' => 'SNC',
            'timezone' => 'Asia/Jakarta',
            'address' => 'Alamat Sync',
        ]);

        $this->kgService = Service::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Kiloan Sync',
            'unit_type' => 'kg',
            'base_price_amount' => 8000,
            'active' => true,
        ]);

        OutletService::query()->create([
            'outlet_id' => $this->outlet->id,
            'service_id' => $this->kgService->id,
            'active' => true,
            'price_override_amount' => 8500,
        ]);

        $this->cashier = $this->createUserWithRole('cashier@sync.local', 'cashier');
        $this->worker = $this->createUserWithRole('worker@sync.local', 'worker');
    }

    public function test_claim_invoice_ranges_are_non_overlap_per_outlet_date(): void
    {
        $date = now()->format('Y-m-d');

        $resp1 = $this->apiAs($this->cashier)->postJson('/api/invoices/range/claim', [
            'device_id' => '11111111-1111-1111-1111-111111111111',
            'outlet_id' => $this->outlet->id,
            'days' => [
                ['date' => $date, 'count' => 2],
            ],
        ]);

        $resp1->assertOk()
            ->assertJsonPath('ranges.0.from', 1)
            ->assertJsonPath('ranges.0.to', 2);

        $resp2 = $this->apiAs($this->cashier)->postJson('/api/invoices/range/claim', [
            'device_id' => '22222222-2222-2222-2222-222222222222',
            'outlet_id' => $this->outlet->id,
            'days' => [
                ['date' => $date, 'count' => 3],
            ],
        ]);

        $resp2->assertOk()
            ->assertJsonPath('ranges.0.from', 3)
            ->assertJsonPath('ranges.0.to', 5);
    }

    public function test_sync_push_order_create_applies_and_duplicate_is_idempotent(): void
    {
        $localNow = now('Asia/Jakarta');
        $date = $localNow->format('Y-m-d');

        $claim = $this->apiAs($this->cashier)->postJson('/api/invoices/range/claim', [
            'device_id' => '33333333-3333-3333-3333-333333333333',
            'outlet_id' => $this->outlet->id,
            'days' => [
                ['date' => $date, 'count' => 1],
            ],
        ])->assertOk();

        $prefix = $claim->json('ranges.0.prefix');
        $from = (int) $claim->json('ranges.0.from');
        $invoiceNo = $prefix.str_pad((string) $from, 4, '0', STR_PAD_LEFT);

        $payload = [
            'device_id' => '33333333-3333-3333-3333-333333333333',
            'mutations' => [
                [
                    'mutation_id' => 'mut-sync-001',
                    'seq' => 1,
                    'type' => 'ORDER_CREATE',
                    'outlet_id' => $this->outlet->id,
                    'client_time' => $localNow->toIso8601String(),
                    'payload' => [
                        'outlet_id' => $this->outlet->id,
                        'order_code' => 'ORD-SYNC-001',
                        'invoice_no' => $invoiceNo,
                        'customer' => [
                            'name' => 'Budi Sync',
                            'phone' => '081234567890',
                        ],
                        'items' => [
                            [
                                'service_id' => $this->kgService->id,
                                'weight_kg' => 3.5,
                            ],
                        ],
                    ],
                ],
            ],
        ];

        $firstPush = $this->apiAs($this->cashier)->postJson('/api/sync/push', $payload);
        $firstPush->assertOk()
            ->assertJsonPath('ack.0.status', 'applied');

        $this->assertDatabaseHas('orders', [
            'tenant_id' => $this->tenant->id,
            'order_code' => 'ORD-SYNC-001',
            'invoice_no' => $invoiceNo,
            'created_by' => $this->cashier->id,
            'updated_by' => $this->cashier->id,
            'source_channel' => 'mobile',
        ]);

        $this->assertDatabaseHas('sync_mutations', [
            'tenant_id' => $this->tenant->id,
            'mutation_id' => 'mut-sync-001',
            'status' => 'applied',
            'created_by' => $this->cashier->id,
            'updated_by' => $this->cashier->id,
            'source_channel' => 'mobile',
        ]);

        $secondPush = $this->apiAs($this->cashier)->postJson('/api/sync/push', $payload);
        $secondPush->assertOk()
            ->assertJsonPath('ack.0.status', 'duplicate');

        $this->assertDatabaseCount('orders', 1);
    }

    public function test_sync_pull_returns_changes_by_cursor(): void
    {
        $localNow = now('Asia/Jakarta');
        $date = $localNow->format('Y-m-d');

        $claim = $this->apiAs($this->cashier)->postJson('/api/invoices/range/claim', [
            'device_id' => '44444444-4444-4444-4444-444444444444',
            'outlet_id' => $this->outlet->id,
            'days' => [
                ['date' => $date, 'count' => 1],
            ],
        ])->assertOk();

        $prefix = $claim->json('ranges.0.prefix');
        $invoiceNo = $prefix.'0001';

        $this->apiAs($this->cashier)->postJson('/api/sync/push', [
            'device_id' => '44444444-4444-4444-4444-444444444444',
            'mutations' => [
                [
                    'mutation_id' => 'mut-sync-002',
                    'seq' => 1,
                    'type' => 'ORDER_CREATE',
                    'outlet_id' => $this->outlet->id,
                    'client_time' => $localNow->toIso8601String(),
                    'payload' => [
                        'outlet_id' => $this->outlet->id,
                        'order_code' => 'ORD-SYNC-002',
                        'invoice_no' => $invoiceNo,
                        'customer' => [
                            'name' => 'Cici Sync',
                            'phone' => '081211110000',
                        ],
                        'items' => [
                            [
                                'service_id' => $this->kgService->id,
                                'weight_kg' => 2.2,
                            ],
                        ],
                    ],
                ],
            ],
        ])->assertOk();

        $pull = $this->apiAs($this->cashier)->postJson('/api/sync/pull', [
            'device_id' => '44444444-4444-4444-4444-444444444444',
            'cursor' => 0,
            'scope' => [
                'mode' => 'selected_outlet',
                'outlet_id' => $this->outlet->id,
            ],
            'limit' => 50,
        ]);

        $pull->assertOk()
            ->assertJsonPath('has_more', false);

        $this->assertGreaterThan(0, (int) $pull->json('next_cursor'));
        $this->assertNotEmpty($pull->json('changes'));
    }

    public function test_sync_push_rejects_order_create_when_quota_exceeded(): void
    {
        Plan::query()->whereKey($this->tenant->current_plan_id)->update([
            'orders_limit' => 1,
        ]);

        $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-SYNC-QT-01',
            'customer' => [
                'name' => 'Quota Seed',
                'phone' => '081200001111',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 1.5,
                ],
            ],
        ])->assertCreated();

        $response = $this->apiAs($this->cashier)->postJson('/api/sync/push', [
            'device_id' => '66666666-6666-6666-6666-666666666666',
            'mutations' => [
                [
                    'mutation_id' => 'mut-sync-qt-001',
                    'seq' => 1,
                    'type' => 'ORDER_CREATE',
                    'outlet_id' => $this->outlet->id,
                    'payload' => [
                        'outlet_id' => $this->outlet->id,
                        'order_code' => 'ORD-SYNC-QT-02',
                        'customer' => [
                            'name' => 'Quota Blocked',
                            'phone' => '081200002222',
                        ],
                        'items' => [
                            [
                                'service_id' => $this->kgService->id,
                                'weight_kg' => 2.0,
                            ],
                        ],
                    ],
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('rejected.0.reason_code', 'QUOTA_EXCEEDED');
    }

    public function test_sync_push_rejects_backward_laundry_status(): void
    {
        $order = $this->apiAs($this->cashier)->postJson('/api/orders', [
            'outlet_id' => $this->outlet->id,
            'order_code' => 'ORD-SYNC-003',
            'customer' => [
                'name' => 'Dodi Sync',
                'phone' => '081266660000',
            ],
            'items' => [
                [
                    'service_id' => $this->kgService->id,
                    'weight_kg' => 3.0,
                ],
            ],
        ])->assertCreated()->json('data');

        $response = $this->apiAs($this->worker)->postJson('/api/sync/push', [
            'device_id' => '55555555-5555-5555-5555-555555555555',
            'mutations' => [
                [
                    'mutation_id' => 'mut-sync-003a',
                    'seq' => 1,
                    'type' => 'ORDER_UPDATE_LAUNDRY_STATUS',
                    'entity' => [
                        'entity_type' => 'order',
                        'entity_id' => $order['id'],
                    ],
                    'payload' => [
                        'status' => 'washing',
                    ],
                ],
                [
                    'mutation_id' => 'mut-sync-003b',
                    'seq' => 2,
                    'type' => 'ORDER_UPDATE_LAUNDRY_STATUS',
                    'entity' => [
                        'entity_type' => 'order',
                        'entity_id' => $order['id'],
                    ],
                    'payload' => [
                        'status' => 'received',
                    ],
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('ack.0.status', 'applied')
            ->assertJsonPath('rejected.0.reason_code', 'STATUS_NOT_FORWARD');

        $this->assertDatabaseHas('sync_mutations', [
            'tenant_id' => $this->tenant->id,
            'mutation_id' => 'mut-sync-003b',
            'status' => 'rejected',
            'reason_code' => 'STATUS_NOT_FORWARD',
            'created_by' => $this->worker->id,
            'updated_by' => $this->worker->id,
            'source_channel' => 'mobile',
        ]);
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
