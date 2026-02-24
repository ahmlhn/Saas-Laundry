<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\Plan;
use App\Models\QuotaUsageCycle;
use App\Models\SubscriptionCycle;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class MigrateLegacySubscriptionsCommand extends Command
{
    protected $signature = 'ops:subscription:migrate-legacy
        {--tenant= : Tenant UUID}
        {--dry-run : Only show migration actions}';

    protected $description = 'Migrate legacy tenant_subscriptions model into subscription_cycles and quota_usage_cycles.';

    public function handle(): int
    {
        $tenantId = (string) ($this->option('tenant') ?? '');
        $dryRun = (bool) $this->option('dry-run');

        $query = Tenant::query()->with('currentPlan:id,key,orders_limit')->orderBy('name');

        if ($tenantId !== '') {
            $query->where('id', $tenantId);
        }

        $tenants = $query->get(['id', 'name', 'current_plan_id', 'current_subscription_cycle_id', 'subscription_state', 'write_access_mode']);

        if ($tenants->isEmpty()) {
            $this->warn('No tenants matched for legacy subscription migration.');

            return self::SUCCESS;
        }

        $migrated = 0;
        $skipped = 0;

        foreach ($tenants as $tenant) {
            if ($tenant->current_subscription_cycle_id) {
                $skipped++;
                $this->line("SKIP tenant={$tenant->id} reason=already_migrated");
                continue;
            }

            $legacy = TenantSubscription::query()
                ->where('tenant_id', $tenant->id)
                ->orderByDesc('ends_at')
                ->first();

            $planId = $legacy?->plan_id ?: $tenant->current_plan_id;
            if (! $planId) {
                $fallbackPlan = Plan::query()->orderBy('display_order')->orderBy('id')->first();
                $planId = $fallbackPlan?->id;
            }

            if (! $planId) {
                $skipped++;
                $this->line("SKIP tenant={$tenant->id} reason=plan_missing");
                continue;
            }

            $plan = Plan::query()->find($planId);
            if (! $plan) {
                $skipped++;
                $this->line("SKIP tenant={$tenant->id} reason=plan_not_found");
                continue;
            }

            $startAt = $legacy?->starts_at ?: now();
            $endAt = $legacy?->ends_at ?: $startAt->copy()->addDays(30)->subSecond();

            if ($endAt->lt($startAt)) {
                $endAt = $startAt->copy()->addDays(30)->subSecond();
            }

            $ordersUsed = Order::query()
                ->where('tenant_id', $tenant->id)
                ->whereBetween('created_at', [$startAt, $endAt])
                ->count();

            if ($dryRun) {
                $migrated++;
                $this->line("DRYRUN migrate tenant={$tenant->id} plan={$plan->key} start={$startAt->toIso8601String()} end={$endAt->toIso8601String()} used={$ordersUsed}");
                continue;
            }

            DB::transaction(function () use ($tenant, $plan, $startAt, $endAt, $ordersUsed): void {
                $cycle = SubscriptionCycle::query()->create([
                    'tenant_id' => $tenant->id,
                    'plan_id' => $plan->id,
                    'orders_limit_snapshot' => $plan->orders_limit,
                    'status' => 'active',
                    'cycle_start_at' => $startAt,
                    'cycle_end_at' => $endAt,
                    'activated_at' => $startAt,
                    'auto_renew' => true,
                    'source' => 'legacy_migration',
                    'created_by' => null,
                    'updated_by' => null,
                ]);

                QuotaUsageCycle::query()->create([
                    'tenant_id' => $tenant->id,
                    'cycle_id' => $cycle->id,
                    'orders_limit_snapshot' => $plan->orders_limit,
                    'orders_used' => $ordersUsed,
                    'last_reconciled_at' => now(),
                ]);

                $tenant->forceFill([
                    'current_plan_id' => $plan->id,
                    'current_subscription_cycle_id' => $cycle->id,
                    'subscription_state' => 'active',
                    'write_access_mode' => 'full',
                ])->save();
            });

            $migrated++;
            $this->line("MIGRATED tenant={$tenant->id} plan={$plan->key} used={$ordersUsed}");
        }

        $this->info("Legacy migration summary: migrated={$migrated}, skipped={$skipped}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
