<?php

namespace App\Console\Commands;

use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

class RunBusinessUatCommand extends Command
{
    protected $signature = 'ops:uat:run
        {--date= : Report date format YYYY-MM-DD}
        {--environment= : Environment label for report}
        {--output= : Custom report path (relative to project root)}
        {--dry-run : Generate report without executing tests}
        {--seed-demo : Seed demo tenant accounts before running UAT pack}';

    protected $description = 'Run business UAT test pack and generate markdown report.';

    public function handle(): int
    {
        $dateOption = (string) ($this->option('date') ?? '');
        $dryRun = (bool) $this->option('dry-run');
        $seedDemo = (bool) $this->option('seed-demo');

        try {
            $reportDate = $dateOption !== '' ? Carbon::createFromFormat('Y-m-d', $dateOption) : now();
        } catch (\Throwable) {
            $this->error('Invalid --date value. Use format YYYY-MM-DD.');

            return self::FAILURE;
        }

        $environment = (string) ($this->option('environment') ?: app()->environment());
        $outputPath = (string) ($this->option('output') ?: sprintf(
            'docs/uat-reports/UAT-%s-automated-pack.md',
            $reportDate->format('Ymd')
        ));

        if ($seedDemo) {
            foreach (['RolesAndPlansSeeder', 'DemoTenantSeeder'] as $seederClass) {
                $seedExit = Artisan::call('db:seed', [
                    '--class' => $seederClass,
                    '--force' => true,
                ]);

                if ($seedExit !== 0) {
                    $this->error("Failed to run seeder {$seederClass} before UAT run.");

                    return self::FAILURE;
                }
            }

            $this->info('Demo accounts seeded.');
        }

        $catalog = $this->scenarioCatalog();
        $testResults = [];

        $isolatedDatabase = null;

        if (! $dryRun) {
            $isolatedDatabase = $this->createIsolatedTestDatabase();
        }

        try {
            if (! $dryRun) {
                $uniqueFilters = array_values(array_unique(array_column($catalog, 'test_filter')));

                foreach ($uniqueFilters as $filter) {
                    $this->line("Running test filter: {$filter}");

                    $result = $this->runTestFilter($filter, $isolatedDatabase);
                    $exit = $result['exit_code'];
                    $output = $result['output'];
                    $noTestsFound = str_contains($output, 'No tests found');
                    $status = ($exit === 0 && ! $noTestsFound) ? 'Pass' : 'Fail';

                    $testResults[$filter] = [
                        'status' => $status,
                        'exit_code' => $exit,
                        'reason' => $result['reason'],
                    ];

                    $this->line(" -> {$status} ({$result['reason']})");
                }
            }
        } finally {
            if ($isolatedDatabase !== null) {
                $this->dropIsolatedTestDatabase($isolatedDatabase);
            }
        }

        $rows = [];
        $passed = 0;
        $failed = 0;
        $blocked = 0;

        foreach ($catalog as $scenario) {
            if ($dryRun) {
                $status = 'Blocked';
                $evidence = 'Not executed (`--dry-run`)';
            } else {
                $result = $testResults[$scenario['test_filter']] ?? ['status' => 'Fail'];
                $status = $result['status'];
                $reason = $result['reason'] ?? '-';
                $evidence = '`'.$scenario['test_filter'].'` ('.$reason.')';
            }

            if ($status === 'Pass') {
                $passed++;
            } elseif ($status === 'Fail') {
                $failed++;
            } else {
                $blocked++;
            }

            $rows[] = [
                'id' => $scenario['id'],
                'role' => $scenario['role'],
                'status' => $status,
                'evidence' => $evidence,
                'notes' => $scenario['notes'],
            ];
        }

        $overallStatus = $failed > 0 ? 'FAIL' : ($dryRun ? 'BLOCKED' : 'PASS');
        $decision = $failed > 0 ? 'NO-GO' : ($dryRun ? 'PENDING' : 'GO with Conditions');

        $content = $this->renderReport(
            reportDate: $reportDate->format('Y-m-d'),
            environment: $environment,
            rows: $rows,
            total: count($rows),
            passed: $passed,
            failed: $failed,
            blocked: $blocked,
            overallStatus: $overallStatus,
            decision: $decision,
        );

        $absolutePath = $this->resolveOutputPath($outputPath);
        $directory = dirname($absolutePath);

        if (! is_dir($directory) && ! mkdir($directory, 0777, true) && ! is_dir($directory)) {
            $this->error("Unable to create report directory: {$directory}");

            return self::FAILURE;
        }

        if (file_put_contents($absolutePath, $content) === false) {
            $this->error("Unable to write report file: {$absolutePath}");

            return self::FAILURE;
        }

        $this->info("UAT report generated: {$outputPath}");
        $this->info("Summary: total=".count($rows).", pass={$passed}, fail={$failed}, blocked={$blocked}, overall={$overallStatus}");

        if ($failed > 0) {
            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    /**
     * @return array<int, array{id:string, role:string, notes:string, test_filter:string}>
     */
    private function scenarioCatalog(): array
    {
        return [
            [
                'id' => 'UAT-01',
                'role' => 'Kasir',
                'notes' => 'Create order non pickup',
                'test_filter' => 'test_create_order_calculates_total_and_normalizes_customer_phone',
            ],
            [
                'id' => 'UAT-02',
                'role' => 'Kasir',
                'notes' => 'Payment append-only',
                'test_filter' => 'test_add_payment_is_append_only_and_updates_due_amount',
            ],
            [
                'id' => 'UAT-03',
                'role' => 'Pekerja',
                'notes' => 'Laundry forward-only transitions',
                'test_filter' => 'test_laundry_status_is_forward_only_and_rejects_invalid_jump',
            ],
            [
                'id' => 'UAT-04',
                'role' => 'Admin',
                'notes' => 'Assign courier role validation',
                'test_filter' => 'test_assign_courier_requires_courier_role_and_status_rules',
            ],
            [
                'id' => 'UAT-05',
                'role' => 'Kurir',
                'notes' => 'Pickup flow progression',
                'test_filter' => 'test_operational_pickup_delivery_flow_runs_end_to_end',
            ],
            [
                'id' => 'UAT-06',
                'role' => 'Kurir + Pekerja',
                'notes' => 'delivery_pending blocked before ready',
                'test_filter' => 'test_assign_courier_requires_courier_role_and_status_rules',
            ],
            [
                'id' => 'UAT-07',
                'role' => 'Kurir',
                'notes' => 'Delivery flow progression',
                'test_filter' => 'test_operational_pickup_delivery_flow_runs_end_to_end',
            ],
            [
                'id' => 'UAT-08',
                'role' => 'Owner/Admin',
                'notes' => 'Billing quota endpoint',
                'test_filter' => 'test_billing_quota_endpoint_returns_snapshot_and_restricts_role',
            ],
            [
                'id' => 'UAT-09',
                'role' => 'Admin',
                'notes' => 'WA lifecycle message logs',
                'test_filter' => 'test_order_events_enqueue_wa_messages_for_premium_plan',
            ],
            [
                'id' => 'UAT-10',
                'role' => 'Semua role',
                'notes' => 'Role guard on master data',
                'test_filter' => 'test_services_and_outlet_services_endpoints_work_with_role_guards',
            ],
        ];
    }

    /**
     * @param array<int, array{id:string, role:string, status:string, evidence:string, notes:string}> $rows
     */
    private function renderReport(
        string $reportDate,
        string $environment,
        array $rows,
        int $total,
        int $passed,
        int $failed,
        int $blocked,
        string $overallStatus,
        string $decision,
    ): string {
        $lines = [];
        $lines[] = '# UAT Findings - Automated Pack';
        $lines[] = '';
        $lines[] = '## Header';
        $lines[] = "- Project: `SaaS Laundry`";
        $lines[] = "- UAT Date: `{$reportDate}`";
        $lines[] = "- Environment: `{$environment}`";
        $lines[] = '- Tester(s): `ops:uat:run (automated)`';
        $lines[] = '- Build/Commit Ref: `working tree local`';
        $lines[] = '';
        $lines[] = '## 1) Ringkasan Eksekusi';
        $lines[] = "- Total skenario: `{$total}`";
        $lines[] = "- Passed: `{$passed}`";
        $lines[] = "- Failed: `{$failed}`";
        $lines[] = "- Blocked: `{$blocked}`";
        $lines[] = "- Overall status: `{$overallStatus}`";
        $lines[] = '';
        $lines[] = '## 2) Hasil Per Skenario';
        $lines[] = '';
        $lines[] = '| Scenario ID | Role | Result (Pass/Fail/Blocked) | Evidence Link/Ref | Notes |';
        $lines[] = '|---|---|---|---|---|';

        foreach ($rows as $row) {
            $lines[] = sprintf(
                '| %s | %s | %s | %s | %s |',
                $row['id'],
                $row['role'],
                $row['status'],
                $row['evidence'],
                $row['notes']
            );
        }

        $lines[] = '';
        $lines[] = '## 3) Daftar Temuan';
        $lines[] = '';
        $lines[] = '| Issue ID | Severity (High/Medium/Low) | Summary | Steps to Reproduce | Expected | Actual | Owner | Target Fix Date | Status |';
        $lines[] = '|---|---|---|---|---|---|---|---|---|';
        $lines[] = '| - | - | Isi jika ada temuan pada eksekusi ini | - | - | - | - | - | Open/Closed |';
        $lines[] = '';
        $lines[] = '## 4) Keputusan Release';
        $lines[] = "- UAT decision: `{$decision}`";
        $lines[] = '- Approved by:';
        $lines[] = '  - Owner: `pending`';
        $lines[] = '  - Admin: `pending`';
        $lines[] = '  - Engineering: `auto`';
        $lines[] = "- Decision date: `{$reportDate}`";
        $lines[] = '';
        $lines[] = '## 5) Evidence Command';
        $lines[] = '- `php artisan ops:uat:run --seed-demo`';

        return implode(PHP_EOL, $lines).PHP_EOL;
    }

    private function resolveOutputPath(string $outputPath): string
    {
        if (str_starts_with($outputPath, '/') || preg_match('/^[A-Za-z]:[\\\\\\/]/', $outputPath) === 1) {
            return $outputPath;
        }

        return base_path($outputPath);
    }

    /**
     * @return array{exit_code:int, output:string, reason:string}
     */
    private function runTestFilter(string $filter, ?string $isolatedDatabase = null): array
    {
        $env = null;

        if ($isolatedDatabase !== null) {
            $defaultConnection = (string) config('database.default');
            $connectionConfig = (array) config("database.connections.{$defaultConnection}", []);

            $env = [
                'APP_ENV' => 'testing',
                'APP_KEY' => (string) config('app.key', ''),
                'BCRYPT_ROUNDS' => '4',
                'BROADCAST_CONNECTION' => 'null',
                'CACHE_STORE' => 'array',
                'DB_CONNECTION' => $defaultConnection,
                'DB_HOST' => (string) ($connectionConfig['host'] ?? env('DB_HOST', '127.0.0.1')),
                'DB_PORT' => (string) ($connectionConfig['port'] ?? env('DB_PORT', '3306')),
                'DB_DATABASE' => $isolatedDatabase,
                'DB_USERNAME' => (string) ($connectionConfig['username'] ?? env('DB_USERNAME', 'root')),
                'DB_PASSWORD' => (string) ($connectionConfig['password'] ?? env('DB_PASSWORD', '')),
                'MAIL_MAILER' => 'array',
                'QUEUE_CONNECTION' => 'sync',
                'SESSION_DRIVER' => 'array',
                'PULSE_ENABLED' => 'false',
                'TELESCOPE_ENABLED' => 'false',
                'NIGHTWATCH_ENABLED' => 'false',
            ];
        }

        $process = new Process(
            [PHP_BINARY, 'artisan', 'test', '--testsuite=Feature', '--filter='.$filter],
            base_path(),
            $env
        );
        $process->setTimeout(600);
        $process->run();

        $output = $process->getOutput().$process->getErrorOutput();
        $exitCode = $process->getExitCode() ?? 1;

        if (str_contains($output, 'No tests found')) {
            return [
                'exit_code' => $exitCode,
                'output' => $output,
                'reason' => 'no-tests-found',
            ];
        }

        return [
            'exit_code' => $exitCode,
            'output' => $output,
            'reason' => $exitCode === 0 ? 'ok' : 'test-failed',
        ];
    }

    private function createIsolatedTestDatabase(): ?string
    {
        $defaultConnection = (string) config('database.default');
        $driver = (string) config("database.connections.{$defaultConnection}.driver", '');

        if ($driver !== 'mysql') {
            $this->warn("Skipping isolated DB creation for non-mysql driver: {$driver}");

            return null;
        }

        $databaseName = sprintf('saas_laundry_uat_%s_%04d', now()->format('YmdHis'), random_int(0, 9999));

        try {
            DB::statement("CREATE DATABASE `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $this->info("Using isolated test database: {$databaseName}");

            return $databaseName;
        } catch (\Throwable $e) {
            $this->warn('Unable to create isolated test database, fallback to shared test DB: '.$e->getMessage());

            return null;
        }
    }

    private function dropIsolatedTestDatabase(string $databaseName): void
    {
        try {
            DB::statement("DROP DATABASE IF EXISTS `{$databaseName}`");
            $this->info("Dropped isolated test database: {$databaseName}");
        } catch (\Throwable $e) {
            $this->warn("Failed to drop isolated test database {$databaseName}: ".$e->getMessage());
        }
    }
}
