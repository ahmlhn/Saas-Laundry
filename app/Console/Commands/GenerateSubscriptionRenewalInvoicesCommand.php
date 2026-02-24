<?php

namespace App\Console\Commands;

use App\Domain\Subscription\SubscriptionPaymentGatewayService;
use App\Models\SubscriptionCycle;
use App\Models\SubscriptionInvoice;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class GenerateSubscriptionRenewalInvoicesCommand extends Command
{
    protected $signature = 'ops:subscription:generate-renewal-invoices
        {--days=7 : Number of days ahead from now to generate renewal invoices}
        {--tenant= : Tenant UUID}
        {--dry-run : Only show what would be generated}';

    protected $description = 'Generate subscription renewal invoices for cycles ending at H-N (default H-7).';

    public function __construct(
        private readonly SubscriptionPaymentGatewayService $paymentGatewayService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $days = max((int) $this->option('days'), 0);
        $tenantId = (string) ($this->option('tenant') ?? '');
        $dryRun = (bool) $this->option('dry-run');
        $targetDate = now()->addDays($days)->toDateString();

        $query = SubscriptionCycle::query()
            ->with('plan:id,key,monthly_price_amount,currency')
            ->where('status', 'active')
            ->where('auto_renew', true)
            ->whereDate('cycle_end_at', $targetDate);

        if ($tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        $cycles = $query->orderBy('cycle_end_at')->get();

        if ($cycles->isEmpty()) {
            $this->warn("No eligible cycles found for renewal invoice generation on {$targetDate}.");

            return self::SUCCESS;
        }

        $created = 0;
        $skipped = 0;
        $gatewayProvider = (string) config('subscription.billing_gateway_provider', 'bri_qris');
        $paymentMethod = $gatewayProvider === 'bri_qris' ? 'bri_qris' : 'bank_transfer';

        foreach ($cycles as $cycle) {
            $alreadyExists = SubscriptionInvoice::query()
                ->where('tenant_id', $cycle->tenant_id)
                ->where('cycle_id', $cycle->id)
                ->whereIn('status', ['issued', 'pending_verification', 'overdue', 'paid'])
                ->exists();

            if ($alreadyExists) {
                $skipped++;
                $this->line("SKIP {$cycle->tenant_id} cycle={$cycle->id} reason=invoice_exists");
                continue;
            }

            $amount = (int) ($cycle->plan?->monthly_price_amount ?? 0);
            if ($amount <= 0) {
                $skipped++;
                $this->line("SKIP {$cycle->tenant_id} cycle={$cycle->id} reason=zero_amount_plan");
                continue;
            }

            $invoiceNo = $this->generateInvoiceNo();

            if ($dryRun) {
                $created++;
                $this->line("DRYRUN create tenant={$cycle->tenant_id} cycle={$cycle->id} invoice_no={$invoiceNo} amount={$amount}");
                continue;
            }

            $invoice = SubscriptionInvoice::query()->create([
                'tenant_id' => $cycle->tenant_id,
                'cycle_id' => $cycle->id,
                'invoice_no' => $invoiceNo,
                'amount_total' => $amount,
                'currency' => $cycle->plan?->currency ?: 'IDR',
                'tax_included' => true,
                'payment_method' => $paymentMethod,
                'gateway_provider' => $paymentMethod === 'bri_qris' ? 'bri_qris' : null,
                'issued_at' => now(),
                'due_at' => $cycle->cycle_end_at,
                'status' => 'issued',
                'created_by' => null,
                'updated_by' => null,
            ]);

            if ($paymentMethod === 'bri_qris') {
                try {
                    $this->paymentGatewayService->createQrisIntent($invoice, null, true);
                } catch (\Throwable $error) {
                    Log::warning('subscription_renewal_qris_intent_failed', [
                        'invoice_id' => $invoice->id,
                        'tenant_id' => $invoice->tenant_id,
                        'error' => $error->getMessage(),
                    ]);

                    $this->warn("WARN tenant={$cycle->tenant_id} cycle={$cycle->id} invoice={$invoiceNo} reason=qris_intent_failed");
                }
            }

            $created++;
            $this->line("CREATE tenant={$cycle->tenant_id} cycle={$cycle->id} invoice_no={$invoiceNo} amount={$amount}");
        }

        $this->info("Renewal invoice summary: target_date={$targetDate}, created={$created}, skipped={$skipped}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }

    private function generateInvoiceNo(): string
    {
        return 'SUB-'.Carbon::now()->format('ymd').'-'.strtoupper(Str::random(6));
    }
}
