<?php

namespace App\Console\Commands;

use App\Models\SubscriptionInvoice;
use App\Models\Tenant;
use Illuminate\Console\Command;

class EnforceSubscriptionStatusCommand extends Command
{
    protected $signature = 'ops:subscription:enforce-status
        {--tenant= : Tenant UUID}
        {--dry-run : Only show status transitions}';

    protected $description = 'Enforce tenant subscription state based on overdue invoices.';

    public function handle(): int
    {
        $tenantId = (string) ($this->option('tenant') ?? '');
        $dryRun = (bool) $this->option('dry-run');
        $suspendPolicy = strtoupper((string) config('subscription.suspend_policy', 'H_PLUS_1'));

        $query = Tenant::query()->orderBy('name');

        if ($tenantId !== '') {
            $query->where('id', $tenantId);
        }

        $tenants = $query->get(['id', 'name', 'subscription_state', 'write_access_mode']);

        if ($tenants->isEmpty()) {
            $this->warn('No tenants matched for subscription status enforcement.');

            return self::SUCCESS;
        }

        $changed = 0;
        $unchanged = 0;

        foreach ($tenants as $tenant) {
            SubscriptionInvoice::query()
                ->where('tenant_id', $tenant->id)
                ->whereIn('status', ['issued', 'pending_verification'])
                ->where('due_at', '<', now())
                ->update(['status' => 'overdue']);

            $hasOverdue = SubscriptionInvoice::query()
                ->where('tenant_id', $tenant->id)
                ->where('status', 'overdue')
                ->exists();

            $hasSuspendOverdue = SubscriptionInvoice::query()
                ->where('tenant_id', $tenant->id)
                ->whereIn('status', ['issued', 'pending_verification', 'overdue'])
                ->where('due_at', '<=', now()->subDay())
                ->exists();

            $fromState = (string) ($tenant->subscription_state ?: 'active');
            $fromWriteMode = (string) ($tenant->write_access_mode ?: 'full');
            $toState = $fromState;
            $toWriteMode = $fromWriteMode;

            if ($suspendPolicy === 'H_PLUS_1' && $hasSuspendOverdue) {
                $toState = 'suspended';
                $toWriteMode = 'read_only';
            } elseif ($hasOverdue) {
                $toState = 'past_due';
                $toWriteMode = 'read_only';
            } else {
                $toState = 'active';
                $toWriteMode = 'full';
            }

            if ($fromState === $toState && $fromWriteMode === $toWriteMode) {
                $unchanged++;
                $this->line("UNCHANGED tenant={$tenant->id} state={$fromState} write={$fromWriteMode}");
                continue;
            }

            if ($dryRun) {
                $changed++;
                $this->line("DRYRUN tenant={$tenant->id} {$fromState}/{$fromWriteMode} -> {$toState}/{$toWriteMode}");
                continue;
            }

            $tenant->forceFill([
                'subscription_state' => $toState,
                'write_access_mode' => $toWriteMode,
            ])->save();

            $changed++;
            $this->line("UPDATED tenant={$tenant->id} {$fromState}/{$fromWriteMode} -> {$toState}/{$toWriteMode}");
        }

        $this->info("Enforce status summary: changed={$changed}, unchanged={$unchanged}, policy={$suspendPolicy}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
