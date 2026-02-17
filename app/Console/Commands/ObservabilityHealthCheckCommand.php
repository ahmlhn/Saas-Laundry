<?php

namespace App\Console\Commands;

use App\Models\Plan;
use App\Models\QuotaUsage;
use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ObservabilityHealthCheckCommand extends Command
{
    protected $signature = 'ops:observe:health
        {--period= : Target quota period (YYYY-MM), default current}
        {--lookback-minutes=15 : Observation window}
        {--failed-jobs-threshold=10 : Threshold failed_jobs in window}
        {--queue-backlog-threshold=100 : Threshold jobs backlog for messaging queue}
        {--wa-failure-ratio-threshold=20 : Threshold WA failed ratio percentage}
        {--quota-usage-threshold=85 : Threshold quota usage percentage}
        {--strict : Treat warning as failure}
        {--json : Output JSON report}';

    protected $description = 'Run observability health checks for queue, WhatsApp delivery, and quota saturation.';

    public function handle(): int
    {
        $period = (string) ($this->option('period') ?: now()->format('Y-m'));
        $lookbackMinutes = max((int) $this->option('lookback-minutes'), 1);
        $failedJobsThreshold = max((int) $this->option('failed-jobs-threshold'), 1);
        $queueBacklogThreshold = max((int) $this->option('queue-backlog-threshold'), 1);
        $waFailureRatioThreshold = max((float) $this->option('wa-failure-ratio-threshold'), 0);
        $quotaUsageThreshold = max((float) $this->option('quota-usage-threshold'), 1);
        $strict = (bool) $this->option('strict');
        $asJson = (bool) $this->option('json');

        if (! preg_match('/^\d{4}-\d{2}$/', $period)) {
            $this->error('Invalid period format. Use YYYY-MM.');

            return self::FAILURE;
        }

        $checks = [];
        $windowStart = now()->subMinutes($lookbackMinutes);

        $this->checkFailedJobs($checks, $windowStart, $failedJobsThreshold);
        $this->checkQueueBacklog($checks, $queueBacklogThreshold);
        $this->checkWaFailureRatio($checks, $windowStart, $waFailureRatioThreshold);
        $this->checkQuotaSaturation($checks, $period, $quotaUsageThreshold);

        $summary = [
            'pass' => 0,
            'warn' => 0,
            'fail' => 0,
        ];

        foreach ($checks as $check) {
            $summary[$check['status']]++;
        }

        if ($asJson) {
            $this->line((string) json_encode([
                'generated_at' => now()->toIso8601String(),
                'period' => $period,
                'lookback_minutes' => $lookbackMinutes,
                'checks' => $checks,
                'summary' => $summary,
                'strict' => $strict,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $rows = array_map(static fn (array $check): array => [
                $check['key'],
                strtoupper($check['status']),
                $check['message'],
            ], $checks);

            $this->table(['Check', 'Status', 'Message'], $rows);
            $this->info("Observability summary: pass={$summary['pass']}, warn={$summary['warn']}, fail={$summary['fail']}, strict=".($strict ? 'yes' : 'no'));
        }

        if ($summary['fail'] > 0) {
            return self::FAILURE;
        }

        if ($strict && $summary['warn'] > 0) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkFailedJobs(array &$checks, Carbon $windowStart, int $threshold): void
    {
        if (! Schema::hasTable('failed_jobs')) {
            $checks[] = $this->check('queue.failed_jobs.recent', 'warn', 'failed_jobs table is missing.');

            return;
        }

        $count = DB::table('failed_jobs')
            ->where('failed_at', '>=', $windowStart)
            ->count();

        $status = $count > $threshold ? 'warn' : 'pass';
        $checks[] = $this->check(
            'queue.failed_jobs.recent',
            $status,
            "failed_jobs={$count} in last {$windowStart->diffInMinutes(now())} minutes (threshold={$threshold})."
        );
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkQueueBacklog(array &$checks, int $threshold): void
    {
        if (! Schema::hasTable('jobs')) {
            $checks[] = $this->check('queue.backlog.messaging', 'warn', 'jobs table is missing.');

            return;
        }

        $messagingBacklog = DB::table('jobs')
            ->where('queue', 'messaging')
            ->count();

        $defaultBacklog = DB::table('jobs')
            ->where('queue', 'default')
            ->count();

        $checks[] = $this->check(
            'queue.backlog.messaging',
            $messagingBacklog > $threshold ? 'warn' : 'pass',
            "messaging backlog={$messagingBacklog} (threshold={$threshold})."
        );

        $checks[] = $this->check(
            'queue.backlog.default',
            $defaultBacklog > $threshold ? 'warn' : 'pass',
            "default backlog={$defaultBacklog} (threshold={$threshold})."
        );
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkWaFailureRatio(array &$checks, Carbon $windowStart, float $threshold): void
    {
        if (! Schema::hasTable('wa_messages')) {
            $checks[] = $this->check('wa.failure_ratio.window', 'warn', 'wa_messages table is missing.');

            return;
        }

        $total = DB::table('wa_messages')
            ->where('updated_at', '>=', $windowStart)
            ->count();

        if ($total === 0) {
            $checks[] = $this->check('wa.failure_ratio.window', 'pass', 'No WA traffic in current window.');

            return;
        }

        $failed = DB::table('wa_messages')
            ->where('updated_at', '>=', $windowStart)
            ->where('status', 'failed')
            ->count();

        $ratio = round(($failed / max($total, 1)) * 100, 2);
        $status = $ratio > $threshold ? 'warn' : 'pass';

        $checks[] = $this->check(
            'wa.failure_ratio.window',
            $status,
            "wa failed ratio={$ratio}% ({$failed}/{$total}) threshold={$threshold}%."
        );
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkQuotaSaturation(array &$checks, string $period, float $threshold): void
    {
        if (! Schema::hasTable('quota_usage')) {
            $checks[] = $this->check('quota.saturation.period', 'warn', 'quota_usage table is missing.');

            return;
        }

        $plans = Plan::query()
            ->get(['id', 'orders_limit'])
            ->keyBy('id');

        $tenants = Tenant::query()
            ->where('status', 'active')
            ->get(['id', 'name', 'current_plan_id']);

        $atRisk = 0;

        foreach ($tenants as $tenant) {
            $plan = $plans->get($tenant->current_plan_id);
            $limit = (int) ($plan?->orders_limit ?? 0);

            if ($limit <= 0) {
                continue;
            }

            $used = (int) (QuotaUsage::query()
                ->where('tenant_id', $tenant->id)
                ->where('period', $period)
                ->value('orders_used') ?? 0);

            $usagePercent = ($used / max($limit, 1)) * 100;

            if ($usagePercent >= $threshold) {
                $atRisk++;
            }
        }

        $checks[] = $this->check(
            'quota.saturation.period',
            $atRisk > 0 ? 'warn' : 'pass',
            "tenants near limit={$atRisk}, threshold={$threshold}%, period={$period}."
        );
    }

    /**
     * @return array{key:string,status:string,message:string}
     */
    private function check(string $key, string $status, string $message): array
    {
        return [
            'key' => $key,
            'status' => $status,
            'message' => $message,
        ];
    }
}
