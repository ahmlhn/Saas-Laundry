<?php

namespace App\Console\Commands;

use App\Domain\Subscription\SubscriptionPaymentGatewayService;
use Illuminate\Console\Command;

class ReconcileSubscriptionPaymentsCommand extends Command
{
    protected $signature = 'ops:subscription:reconcile-payments
        {--tenant= : Tenant UUID}
        {--dry-run : Only show reconciliation impact without updating records}';

    protected $description = 'Reconcile subscription invoices against accepted gateway payment events.';

    public function __construct(
        private readonly SubscriptionPaymentGatewayService $paymentGatewayService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantId = (string) ($this->option('tenant') ?? '');
        $dryRun = (bool) $this->option('dry-run');

        $summary = $this->paymentGatewayService->reconcileGatewayPayments(
            tenantId: $tenantId !== '' ? $tenantId : null,
            dryRun: $dryRun,
        );

        $this->info(sprintf(
            'Reconcile payment summary: scanned=%d, updated=%d, mismatch=%d, dry_run=%s',
            (int) ($summary['scanned'] ?? 0),
            (int) ($summary['updated'] ?? 0),
            (int) ($summary['mismatch'] ?? 0),
            $dryRun ? 'yes' : 'no'
        ));

        return self::SUCCESS;
    }
}
