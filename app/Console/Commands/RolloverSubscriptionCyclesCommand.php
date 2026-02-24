<?php

namespace App\Console\Commands;

use App\Models\Plan;
use App\Models\QuotaUsageCycle;
use App\Models\SubscriptionChangeRequest;
use App\Models\SubscriptionCycle;
use App\Models\SubscriptionInvoice;
use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RolloverSubscriptionCyclesCommand extends Command
{
    protected $signature = 'ops:subscription:rollover
        {--tenant= : Tenant UUID}
        {--dry-run : Only show what would be rolled over}';

    protected $description = 'Create next subscription cycles for tenants whose current cycle has ended.';

    public function handle(): int
    {
        $tenantId = (string) ($this->option('tenant') ?? '');
        $dryRun = (bool) $this->option('dry-run');

        $query = SubscriptionCycle::query()
            ->with(['tenant:id,name,current_plan_id,subscription_state,write_access_mode', 'plan:id,key,orders_limit'])
            ->where('status', 'active')
            ->where('cycle_end_at', '<', now())
            ->orderBy('cycle_end_at');

        if ($tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        $cycles = $query->get();

        if ($cycles->isEmpty()) {
            $this->warn('No ended active subscription cycle to roll over.');

            return self::SUCCESS;
        }

        $rolled = 0;
        $skipped = 0;

        foreach ($cycles as $currentCycle) {
            $tenant = $currentCycle->tenant;
            if (! $tenant) {
                $skipped++;
                $this->line("SKIP cycle={$currentCycle->id} reason=tenant_missing");
                continue;
            }

            $hasBlockingInvoice = SubscriptionInvoice::query()
                ->where('tenant_id', $tenant->id)
                ->whereIn('status', ['issued', 'pending_verification', 'overdue'])
                ->where('due_at', '<=', now())
                ->exists();

            if ($hasBlockingInvoice) {
                $skipped++;
                $this->line("SKIP tenant={$tenant->id} cycle={$currentCycle->id} reason=blocking_invoice");
                continue;
            }

            $pendingChange = SubscriptionChangeRequest::query()
                ->where('tenant_id', $tenant->id)
                ->where('status', 'pending')
                ->where('effective_at', '<=', now())
                ->orderBy('effective_at')
                ->first();

            $nextPlanId = $pendingChange?->target_plan_id ?: $currentCycle->plan_id;
            $nextPlan = Plan::query()->find($nextPlanId);

            if (! $nextPlan) {
                $skipped++;
                $this->line("SKIP tenant={$tenant->id} cycle={$currentCycle->id} reason=next_plan_missing");
                continue;
            }

            $nextStart = $currentCycle->cycle_end_at->copy()->addSecond();
            $nextEnd = $nextStart->copy()->addDays(30)->subSecond();

            if ($dryRun) {
                $rolled++;
                $this->line("DRYRUN rollover tenant={$tenant->id} from={$currentCycle->id} to_plan={$nextPlan->key} start={$nextStart->toIso8601String()}");
                continue;
            }

            DB::transaction(function () use ($tenant, $currentCycle, $pendingChange, $nextPlan, $nextStart, $nextEnd): void {
                $newCycle = SubscriptionCycle::query()->create([
                    'tenant_id' => $tenant->id,
                    'plan_id' => $nextPlan->id,
                    'orders_limit_snapshot' => $nextPlan->orders_limit,
                    'status' => 'active',
                    'cycle_start_at' => $nextStart,
                    'cycle_end_at' => $nextEnd,
                    'activated_at' => $nextStart,
                    'auto_renew' => (bool) $currentCycle->auto_renew,
                    'source' => 'rollover',
                    'created_by' => null,
                    'updated_by' => null,
                ]);

                QuotaUsageCycle::query()->create([
                    'tenant_id' => $tenant->id,
                    'cycle_id' => $newCycle->id,
                    'orders_limit_snapshot' => $nextPlan->orders_limit,
                    'orders_used' => 0,
                ]);

                $currentCycle->forceFill([
                    'status' => 'ended',
                ])->save();

                $tenant->forceFill([
                    'current_plan_id' => $nextPlan->id,
                    'current_subscription_cycle_id' => $newCycle->id,
                    'subscription_state' => 'active',
                    'write_access_mode' => 'full',
                ])->save();

                if ($pendingChange) {
                    $pendingChange->forceFill([
                        'status' => 'applied',
                        'decision_note' => 'Applied automatically at cycle rollover.',
                    ])->save();
                }
            });

            $rolled++;
            $this->line("ROLLOVER tenant={$tenant->id} cycle={$currentCycle->id} next_plan={$nextPlan->key}");
        }

        $this->info("Rollover summary: rolled={$rolled}, skipped={$skipped}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
