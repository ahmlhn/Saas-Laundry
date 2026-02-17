<?php

namespace App\Console\Commands;

use App\Jobs\SendWaMessageJob;
use App\Models\WaMessage;
use Illuminate\Console\Command;

class RedriveFailedWaMessagesCommand extends Command
{
    /**
     * @var array<int, string>
     */
    private const DEFAULT_TRANSIENT_REASONS = [
        'NETWORK_ERROR',
        'RATE_LIMIT',
        'UNKNOWN_ERROR',
        'PROVIDER_TIMEOUT',
    ];

    protected $signature = 'ops:wa:redrive-failed
        {--tenant= : Tenant UUID}
        {--limit=200 : Max failed messages to redrive}
        {--reason=* : Restrict to reason code(s)}
        {--all-reasons : Include any reason code (not only transient defaults)}
        {--dry-run : Show candidates without changing records}';

    protected $description = 'Requeue failed WA messages and dispatch send jobs.';

    public function handle(): int
    {
        $tenantId = $this->option('tenant');
        $limit = max((int) $this->option('limit'), 1);
        $dryRun = (bool) $this->option('dry-run');
        $allReasons = (bool) $this->option('all-reasons');

        $reasonOptions = $this->option('reason');
        $reasonOptions = is_array($reasonOptions) ? array_values(array_filter($reasonOptions, fn ($v): bool => is_string($v) && $v !== '')) : [];

        $reasons = count($reasonOptions) > 0
            ? $reasonOptions
            : ($allReasons ? [] : self::DEFAULT_TRANSIENT_REASONS);

        $query = WaMessage::query()
            ->where('status', 'failed')
            ->orderBy('updated_at');

        if (is_string($tenantId) && $tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        if (count($reasons) > 0) {
            $query->whereIn('last_error_code', $reasons);
        }

        $messages = $query->limit($limit)->get();

        if ($messages->isEmpty()) {
            $this->info('No failed WA messages matched for redrive.');

            return self::SUCCESS;
        }

        $processed = 0;

        foreach ($messages as $message) {
            $processed++;

            $this->line("Candidate: {$message->id} {$message->last_error_code} attempts={$message->attempts}");

            if ($dryRun) {
                continue;
            }

            $meta = (array) ($message->metadata_json ?? []);
            $meta['manual_redrive_at'] = now()->toIso8601String();

            $message->forceFill([
                'status' => 'queued',
                'attempts' => 0,
                'last_error_code' => null,
                'last_error_message' => null,
                'metadata_json' => $meta,
            ])->save();

            SendWaMessageJob::dispatch($message->id)->onQueue('messaging');
        }

        $this->info("Redrive summary: processed={$processed}, dry_run=".($dryRun ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
