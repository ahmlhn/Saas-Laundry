<?php

namespace Database\Seeders;

use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Role;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoTenantSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $plan = Plan::query()->where('key', 'standard')->firstOrFail();

        $tenant = Tenant::query()->firstOrCreate(
            ['name' => 'Demo Laundry'],
            [
                'current_plan_id' => $plan->id,
                'status' => 'active',
            ]
        );

        if (! $tenant->current_plan_id) {
            $tenant->forceFill([
                'current_plan_id' => $plan->id,
                'status' => 'active',
            ])->save();
        }

        $outlet = Outlet::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'code' => 'BL'],
            [
                'name' => 'Outlet Utama',
                'timezone' => 'Asia/Jakarta',
                'address' => 'Alamat demo outlet',
            ]
        );

        $roleByKey = Role::query()->whereIn('key', ['owner', 'admin', 'cashier', 'worker', 'courier'])
            ->get()
            ->keyBy('key');

        $demoUsers = [
            [
                'email' => 'owner@demo.local',
                'name' => 'Demo Owner',
                'phone' => '628111111111',
                'role_key' => 'owner',
            ],
            [
                'email' => 'admin@demo.local',
                'name' => 'Demo Admin',
                'phone' => '628111111112',
                'role_key' => 'admin',
            ],
            [
                'email' => 'cashier@demo.local',
                'name' => 'Demo Cashier',
                'phone' => '628111111113',
                'role_key' => 'cashier',
            ],
            [
                'email' => 'worker@demo.local',
                'name' => 'Demo Worker',
                'phone' => '628111111114',
                'role_key' => 'worker',
            ],
            [
                'email' => 'courier@demo.local',
                'name' => 'Demo Courier',
                'phone' => '628111111115',
                'role_key' => 'courier',
            ],
        ];

        foreach ($demoUsers as $demoUser) {
            $role = $roleByKey->get($demoUser['role_key']);

            if (! $role) {
                continue;
            }

            $user = User::query()->firstOrCreate(
                ['email' => $demoUser['email']],
                [
                    'tenant_id' => $tenant->id,
                    'name' => $demoUser['name'],
                    'phone' => $demoUser['phone'],
                    'status' => 'active',
                    'password' => Hash::make('password'),
                ]
            );

            $user->forceFill([
                'tenant_id' => $tenant->id,
                'name' => $demoUser['name'],
                'phone' => $demoUser['phone'],
                'status' => 'active',
                'password' => Hash::make('password'),
            ])->save();

            $user->roles()->syncWithoutDetaching([$role->id]);
            $user->outlets()->syncWithoutDetaching([$outlet->id]);
        }

        $serviceReguler = Service::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Kiloan Reguler'],
            [
                'unit_type' => 'kg',
                'base_price_amount' => 8000,
                'active' => true,
            ]
        );

        $serviceExpress = Service::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'name' => 'Cuci Satuan'],
            [
                'unit_type' => 'pcs',
                'base_price_amount' => 5000,
                'active' => true,
            ]
        );

        OutletService::query()->firstOrCreate(
            ['outlet_id' => $outlet->id, 'service_id' => $serviceReguler->id],
            ['active' => true]
        );

        OutletService::query()->firstOrCreate(
            ['outlet_id' => $outlet->id, 'service_id' => $serviceExpress->id],
            ['active' => true]
        );

        $period = now()->format('Y-m');

        TenantSubscription::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'period' => $period],
            [
                'plan_id' => $plan->id,
                'starts_at' => now()->startOfMonth(),
                'ends_at' => now()->endOfMonth(),
                'status' => 'active',
            ]
        );

        QuotaUsage::query()->firstOrCreate(
            ['tenant_id' => $tenant->id, 'period' => $period],
            ['orders_used' => 0]
        );
    }
}
