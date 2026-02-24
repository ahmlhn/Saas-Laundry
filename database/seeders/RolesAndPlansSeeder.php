<?php

namespace Database\Seeders;

use App\Models\Plan;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolesAndPlansSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $roles = [
            ['key' => 'platform_owner', 'name' => 'Platform Owner'],
            ['key' => 'platform_billing', 'name' => 'Platform Billing'],
            ['key' => 'owner', 'name' => 'Owner'],
            ['key' => 'tenant_manager', 'name' => 'Manajer Tenant'],
            ['key' => 'admin', 'name' => 'Admin'],
            ['key' => 'cashier', 'name' => 'Kasir'],
            ['key' => 'worker', 'name' => 'Pekerja'],
            ['key' => 'courier', 'name' => 'Kurir'],
        ];

        foreach ($roles as $role) {
            Role::query()->updateOrCreate(['key' => $role['key']], $role);
        }

        $plans = [
            [
                'key' => 'free',
                'name' => 'Gratis',
                'orders_limit' => 200,
                'monthly_price_amount' => 0,
                'currency' => 'IDR',
                'is_active' => true,
                'display_order' => 10,
            ],
            [
                'key' => 'standard',
                'name' => 'Standar',
                'orders_limit' => 1000,
                'monthly_price_amount' => 149000,
                'currency' => 'IDR',
                'is_active' => true,
                'display_order' => 20,
            ],
            [
                'key' => 'premium',
                'name' => 'Premium',
                'orders_limit' => 5000,
                'monthly_price_amount' => 349000,
                'currency' => 'IDR',
                'is_active' => true,
                'display_order' => 30,
            ],
            [
                'key' => 'pro',
                'name' => 'Pro',
                'orders_limit' => 20000,
                'monthly_price_amount' => 799000,
                'currency' => 'IDR',
                'is_active' => true,
                'display_order' => 40,
            ],
        ];

        foreach ($plans as $plan) {
            Plan::query()->updateOrCreate(['key' => $plan['key']], $plan);
        }
    }
}
