<?php

namespace Tests\Feature;

use App\Models\Outlet;
use App\Models\Tenant;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DemoSeederUatAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_demo_seeder_creates_multi_role_accounts_for_business_uat(): void
    {
        $this->seed(DatabaseSeeder::class);

        $tenant = Tenant::query()->where('name', 'Demo Laundry')->first();
        $this->assertNotNull($tenant);

        $outlet = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->where('code', 'BL')
            ->first();

        $this->assertNotNull($outlet);

        $expectedUsers = [
            'owner@demo.local' => 'owner',
            'admin@demo.local' => 'admin',
            'cashier@demo.local' => 'cashier',
            'worker@demo.local' => 'worker',
            'courier@demo.local' => 'courier',
        ];

        foreach ($expectedUsers as $email => $roleKey) {
            $user = User::query()->where('email', $email)->first();

            $this->assertNotNull($user, "User {$email} must exist.");
            $this->assertSame($tenant->id, $user->tenant_id, "User {$email} must be scoped to demo tenant.");
            $this->assertSame('active', $user->status, "User {$email} must be active.");
            $this->assertTrue(Hash::check('password', $user->password), "User {$email} must use demo password.");
            $this->assertTrue(
                $user->roles()->where('key', $roleKey)->exists(),
                "User {$email} must have role {$roleKey}."
            );
            $this->assertTrue(
                $user->outlets()->whereKey($outlet->id)->exists(),
                "User {$email} must be assigned to outlet {$outlet->id}."
            );
        }
    }
}
