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
            ['key' => 'free', 'name' => 'Gratis', 'orders_limit' => 200],
            ['key' => 'standard', 'name' => 'Standar', 'orders_limit' => 1000],
            ['key' => 'premium', 'name' => 'Premium', 'orders_limit' => 5000],
            ['key' => 'pro', 'name' => 'Pro', 'orders_limit' => 20000],
        ];

        foreach ($plans as $plan) {
            Plan::query()->updateOrCreate(['key' => $plan['key']], $plan);
        }
    }
}
