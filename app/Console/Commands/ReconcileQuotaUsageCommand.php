<?php

namespace App\Console\Commands;

use App\Models\Order;
use App\Models\QuotaUsage;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Console\Command;

class ReconcileQuotaUsageCommand extends Command
{
    protected $signature = 'ops:quota:reconcile
        {period? : Target period format YYYY-MM. Default current period}
        {--tenant= : Tenant UUID}
        {--dry-run : Only show calculated usage}';

    protected $description = 'Rebuild quota_usage values from orders per period.';

    public function handle(): int
    {
        $period = (string) ($this->argument('period') ?: now()->format('Y-m'));
        $tenantId = $this->option('tenant');
        $dryRun = (bool) $this->option('dry-run');

        if (! preg_match('/^\d{4}-\d{2}$/', $period)) {
            $this->error('Invalid period format. Use YYYY-MM.');

            return self::FAILURE;
        }

        $start = Carbon::createFromFormat('Y-m', $period)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $tenantQuery = Tenant::query()->orderBy('name');

        if (is_string($tenantId) && $tenantId !== '') {
            $tenantQuery->where('id', $tenantId);
        }

        $tenants = $tenantQuery->get(['id', 'name']);

        if ($tenants->isEmpty()) {
            $this->warn('No tenants matched for reconciliation.');

            return self::SUCCESS;
        }

        $updated = 0;

        foreach ($tenants as $tenant) {
            $count = Order::query()
                ->where('tenant_id', $tenant->id)
                ->whereBetween('created_at', [$start, $end])
                ->count();

            $this->line("Tenant {$tenant->name} ({$tenant->id}) -> {$count}");

            if ($dryRun) {
                continue;
            }

            QuotaUsage::query()->updateOrCreate(
                [
                    'tenant_id' => $tenant->id,
                    'period' => $period,
                ],
                [
                    'orders_used' => $count,
                ]
            );

            $updated++;
        }

        $this->info("Quota reconcile summary: period={$period}, tenants={$tenants->count()}, updated={$updated}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
