<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\QuotaUsageCycle;
use Illuminate\Console\Command;

class ReconcileSubscriptionQuotaCommand extends Command
{
    protected $signature = 'ops:subscription:reconcile-quota
        {--tenant= : Tenant UUID}
        {--cycle= : Subscription cycle UUID}
        {--dry-run : Only show recalculated values}';

    protected $description = 'Reconcile quota_usage_cycles from order records within each cycle window.';

    public function handle(): int
    {
        $tenantId = (string) ($this->option('tenant') ?? '');
        $cycleId = (string) ($this->option('cycle') ?? '');
        $dryRun = (bool) $this->option('dry-run');

        $query = QuotaUsageCycle::query()
            ->with('cycle:id,tenant_id,cycle_start_at,cycle_end_at')
            ->orderBy('updated_at');

        if ($tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        if ($cycleId !== '') {
            $query->where('cycle_id', $cycleId);
        }

        $rows = $query->get();

        if ($rows->isEmpty()) {
            $this->warn('No quota usage cycle records matched for reconciliation.');

            return self::SUCCESS;
        }

        $updated = 0;

        foreach ($rows as $usage) {
            $cycle = $usage->cycle;
            if (! $cycle || ! $cycle->cycle_start_at || ! $cycle->cycle_end_at) {
                $this->line("SKIP usage={$usage->id} reason=cycle_missing");
                continue;
            }

            $calculated = Order::query()
                ->where('tenant_id', $usage->tenant_id)
                ->whereBetween('created_at', [$cycle->cycle_start_at, $cycle->cycle_end_at])
                ->count();

            if ($dryRun) {
                $this->line("DRYRUN usage={$usage->id} tenant={$usage->tenant_id} old={$usage->orders_used} new={$calculated}");
                $updated++;
                continue;
            }

            $usage->forceFill([
                'orders_used' => $calculated,
                'last_reconciled_at' => now(),
            ])->save();

            $this->line("UPDATED usage={$usage->id} tenant={$usage->tenant_id} old={$usage->getOriginal('orders_used')} new={$calculated}");
            $updated++;
        }

        $this->info("Reconcile subscription quota summary: rows={$rows->count()}, processed={$updated}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
