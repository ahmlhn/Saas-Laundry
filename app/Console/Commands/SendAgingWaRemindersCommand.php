<?php

namespace App\Console\Commands;

use App\Domain\Messaging\WaDispatchService;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Builder;

class SendAgingWaRemindersCommand extends Command
{
    /**
     * @var array<int, string>
     */
    private const DEFAULT_COLLECTION_STATUSES = [
        'pending',
        'contacted',
        'promise_to_pay',
        'escalated',
    ];

    /**
     * @var array<int, string>
     */
    private const VALID_COLLECTION_STATUSES = [
        'pending',
        'contacted',
        'promise_to_pay',
        'escalated',
        'resolved',
    ];

    /**
     * @var array<int, string>
     */
    private const VALID_BUCKETS = [
        'd0_7',
        'd8_14',
        'd15_30',
        'd31_plus',
    ];

    protected $signature = 'ops:wa:send-aging-reminders
        {--tenant= : Tenant UUID}
        {--outlet= : Outlet UUID}
        {--bucket=* : Restrict to aging bucket(s): d0_7,d8_14,d15_30,d31_plus}
        {--collection-status=* : Restrict to collection status (default pending/contacted/promise_to_pay/escalated)}
        {--as-of= : Date reference YYYY-MM-DD (default today)}
        {--limit=200 : Max reminder enqueues}
        {--dry-run : Preview candidates without enqueue}';

    protected $description = 'Send WhatsApp billing reminders based on aging bucket and collection workflow.';

    public function __construct(
        private readonly WaDispatchService $waDispatchService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantId = (string) ($this->option('tenant') ?? '');
        $outletId = (string) ($this->option('outlet') ?? '');
        $limit = max((int) $this->option('limit'), 1);
        $dryRun = (bool) $this->option('dry-run');
        $asOfInput = (string) ($this->option('as-of') ?: now()->format('Y-m-d'));

        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOfInput)) {
            $this->error('Invalid --as-of format. Use YYYY-MM-DD.');

            return self::FAILURE;
        }

        $asOf = Carbon::createFromFormat('Y-m-d', $asOfInput)->startOfDay();

        $bucketOptions = collect((array) $this->option('bucket'))
            ->filter(fn ($bucket): bool => is_string($bucket) && $bucket !== '')
            ->values();
        $buckets = $bucketOptions->isEmpty() ? collect(self::VALID_BUCKETS) : $bucketOptions;
        $invalidBuckets = $buckets->diff(self::VALID_BUCKETS)->values();

        if ($invalidBuckets->isNotEmpty()) {
            $this->error('Invalid bucket option(s): '.implode(', ', $invalidBuckets->all()));

            return self::FAILURE;
        }

        $statusOptions = collect((array) $this->option('collection-status'))
            ->filter(fn ($status): bool => is_string($status) && $status !== '')
            ->values();
        $collectionStatuses = $statusOptions->isEmpty()
            ? collect(self::DEFAULT_COLLECTION_STATUSES)
            : $statusOptions;
        $invalidStatuses = $collectionStatuses->diff(self::VALID_COLLECTION_STATUSES)->values();

        if ($invalidStatuses->isNotEmpty()) {
            $this->error('Invalid collection status option(s): '.implode(', ', $invalidStatuses->all()));

            return self::FAILURE;
        }

        $query = Order::query()
            ->where('due_amount', '>', 0);

        if ($tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        if ($outletId !== '') {
            $query->where('outlet_id', $outletId);
        }

        $this->applyCollectionStatusFilter($query, $collectionStatuses->all());

        $processed = 0;
        $enqueued = 0;
        $skipped = 0;

        foreach ($query->orderBy('created_at')->cursor() as $order) {
            if ($processed >= $limit) {
                break;
            }

            $ageDays = Carbon::parse($order->created_at)->startOfDay()->diffInDays($asOf);
            $bucketKey = $this->agingBucketKey($ageDays);

            if (! $buckets->contains($bucketKey)) {
                continue;
            }

            $processed++;

            $this->line("Candidate {$processed}: {$order->order_code} due={$order->due_amount} bucket={$bucketKey} age={$ageDays}d");

            if ($dryRun) {
                continue;
            }

            $message = $this->waDispatchService->enqueueOrderEvent(
                order: $order,
                templateId: 'WA_BILLING_REMINDER',
                variables: [
                    'aging_days' => $ageDays,
                    'aging_bucket_key' => $bucketKey,
                    'aging_bucket_label' => $this->agingBucketLabel($bucketKey),
                ],
                metadata: [
                    'source' => 'system',
                    'source_channel' => 'system',
                    'automation' => 'aging_reminder',
                    'as_of' => $asOf->format('Y-m-d'),
                    'aging_bucket' => $bucketKey,
                    'idempotency_suffix' => sprintf('aging-reminder-%s-%s', $asOf->format('Ymd'), $bucketKey),
                ],
            );

            if ($message) {
                $enqueued++;
            } else {
                $skipped++;
            }
        }

        $this->info(sprintf(
            'Aging reminder summary: processed=%d, enqueued=%d, skipped=%d, dry_run=%s, as_of=%s',
            $processed,
            $enqueued,
            $skipped,
            $dryRun ? 'yes' : 'no',
            $asOf->format('Y-m-d'),
        ));

        return self::SUCCESS;
    }

    /**
     * @param array<int, string> $statuses
     */
    private function applyCollectionStatusFilter(Builder $query, array $statuses): void
    {
        if (count($statuses) === 0) {
            return;
        }

        $statuses = array_values(array_unique($statuses));
        $containsPending = in_array('pending', $statuses, true);
        $nonPending = array_values(array_filter($statuses, fn (string $status): bool => $status !== 'pending'));

        $query->where(function (Builder $builder) use ($containsPending, $nonPending): void {
            if ($containsPending) {
                $builder->whereNull('collection_status')
                    ->orWhere('collection_status', 'pending');
            }

            if (count($nonPending) > 0) {
                $builder->orWhereIn('collection_status', $nonPending);
            }
        });
    }

    private function agingBucketKey(int $ageDays): string
    {
        if ($ageDays <= 7) {
            return 'd0_7';
        }

        if ($ageDays <= 14) {
            return 'd8_14';
        }

        if ($ageDays <= 30) {
            return 'd15_30';
        }

        return 'd31_plus';
    }

    private function agingBucketLabel(string $bucketKey): string
    {
        return match ($bucketKey) {
            'd0_7' => '0-7 hari',
            'd8_14' => '8-14 hari',
            'd15_30' => '15-30 hari',
            default => '>30 hari',
        };
    }
}
