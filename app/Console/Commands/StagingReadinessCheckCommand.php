<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class StagingReadinessCheckCommand extends Command
{
    protected $signature = 'ops:readiness:check
        {--strict : Treat warnings as failures}
        {--json : Output readiness report as JSON}';

    protected $description = 'Run staging readiness checks for release operations.';

    public function handle(): int
    {
        $strict = (bool) $this->option('strict');
        $asJson = (bool) $this->option('json');

        $checks = [];

        $this->checkAppKey($checks);
        $this->checkDatabaseConnection($checks);
        $this->checkMigrations($checks);
        $this->checkQueueConnection($checks);
        $this->checkSchedulerBaseline($checks);
        $this->checkStorageWritable($checks);
        $this->checkWaProviderBaseline($checks);

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
            $this->info("Readiness summary: pass={$summary['pass']}, warn={$summary['warn']}, fail={$summary['fail']}, strict=".($strict ? 'yes' : 'no'));
        }

        $hasFailure = $summary['fail'] > 0;
        $hasWarning = $summary['warn'] > 0;

        if ($hasFailure || ($strict && $hasWarning)) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkAppKey(array &$checks): void
    {
        $appKey = trim((string) config('app.key'));

        if ($appKey === '') {
            $checks[] = $this->check('app.key.configured', 'fail', 'APP_KEY is missing.');

            return;
        }

        $checks[] = $this->check('app.key.configured', 'pass', 'APP_KEY is configured.');
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkDatabaseConnection(array &$checks): void
    {
        try {
            DB::connection()->getPdo();
            $checks[] = $this->check(
                'database.connection',
                'pass',
                'Database connection is healthy ('.config('database.default').').'
            );
        } catch (Throwable $e) {
            $checks[] = $this->check(
                'database.connection',
                'fail',
                'Database connection failed: '.$e->getMessage()
            );
        }
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkMigrations(array &$checks): void
    {
        if (! Schema::hasTable('migrations')) {
            $checks[] = $this->check('database.migrations.pending', 'fail', 'Migrations table is missing.');

            return;
        }

        $files = glob(database_path('migrations/*.php')) ?: [];
        $migrationNames = array_map(static fn (string $path): string => basename($path, '.php'), $files);
        sort($migrationNames);

        $ran = DB::table('migrations')->pluck('migration')->map(static fn ($value): string => (string) $value)->all();
        $ranLookup = array_fill_keys($ran, true);

        $pending = array_values(array_filter(
            $migrationNames,
            static fn (string $migration): bool => ! array_key_exists($migration, $ranLookup)
        ));

        if (count($pending) === 0) {
            $checks[] = $this->check('database.migrations.pending', 'pass', 'No pending migrations.');

            return;
        }

        $preview = implode(', ', array_slice($pending, 0, 3));
        $suffix = count($pending) > 3 ? ' ...' : '';

        $checks[] = $this->check(
            'database.migrations.pending',
            'fail',
            'Pending migrations: '.$preview.$suffix
        );
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkQueueConnection(array &$checks): void
    {
        $queueDefault = (string) config('queue.default', '');

        if ($queueDefault === 'sync') {
            $checks[] = $this->check(
                'queue.connection.mode',
                'warn',
                'QUEUE_CONNECTION is sync. Use async worker backend for staging/production.'
            );
        } elseif ($queueDefault === '') {
            $checks[] = $this->check('queue.connection.mode', 'fail', 'QUEUE_CONNECTION is not configured.');
        } else {
            $checks[] = $this->check('queue.connection.mode', 'pass', "QUEUE_CONNECTION uses '{$queueDefault}'.");
        }

        if ($queueDefault === 'database') {
            $hasJobsTable = Schema::hasTable('jobs');
            $checks[] = $this->check(
                'queue.database.jobs_table',
                $hasJobsTable ? 'pass' : 'fail',
                $hasJobsTable ? 'jobs table exists.' : 'jobs table is missing.'
            );
        }

        $hasFailedJobs = Schema::hasTable('failed_jobs');
        $checks[] = $this->check(
            'queue.failed_jobs.table',
            $hasFailedJobs ? 'pass' : 'warn',
            $hasFailedJobs ? 'failed_jobs table exists.' : 'failed_jobs table missing; failure diagnostics may be limited.'
        );
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkSchedulerBaseline(array &$checks): void
    {
        /** @var Schedule $schedule */
        $schedule = app(Schedule::class);
        $scheduledCommands = collect($schedule->events())
            ->map(static fn ($event): string => (string) ($event->command ?? ''))
            ->filter(static fn (string $command): bool => $command !== '')
            ->values();

        $required = [
            'ops:wa:redrive-failed --limit=100',
            'ops:wa:send-aging-reminders --limit=100',
            'ops:observe:health --lookback-minutes=15',
            'ops:quota:reconcile',
            'ops:audit:archive --days=90',
        ];

        foreach ($required as $command) {
            $exists = $scheduledCommands->contains(static fn (string $scheduledCommand): bool => str_contains($scheduledCommand, $command));
            $checks[] = $this->check(
                "scheduler.command.{$command}",
                $exists ? 'pass' : 'fail',
                $exists ? "Scheduled: {$command}" : "Missing schedule entry: {$command}"
            );
        }
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkStorageWritable(array &$checks): void
    {
        $targets = [
            'storage/app' => storage_path('app'),
            'storage/logs' => storage_path('logs'),
            'bootstrap/cache' => base_path('bootstrap/cache'),
        ];

        foreach ($targets as $key => $path) {
            $exists = is_dir($path);
            $writable = $exists && is_writable($path);

            if (! $exists) {
                $checks[] = $this->check("filesystem.{$key}", 'fail', "Directory missing: {$path}");

                continue;
            }

            $checks[] = $this->check(
                "filesystem.{$key}",
                $writable ? 'pass' : 'fail',
                $writable ? "Writable: {$path}" : "Not writable: {$path}"
            );
        }
    }

    /**
     * @param array<int, array{key:string,status:string,message:string}> $checks
     */
    private function checkWaProviderBaseline(array &$checks): void
    {
        if (! Schema::hasTable('wa_providers')) {
            $checks[] = $this->check('wa.provider.mock_seed', 'fail', 'wa_providers table is missing.');

            return;
        }

        $hasMock = DB::table('wa_providers')
            ->where('key', 'mock')
            ->exists();

        $checks[] = $this->check(
            'wa.provider.mock_seed',
            $hasMock ? 'pass' : 'warn',
            $hasMock ? 'Mock WA provider baseline exists.' : 'Mock WA provider baseline not found.'
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
