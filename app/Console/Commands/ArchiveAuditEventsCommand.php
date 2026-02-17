<?php

namespace App\Console\Commands;

use App\Models\AuditEvent;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

class ArchiveAuditEventsCommand extends Command
{
    protected $signature = 'ops:audit:archive
        {--days=90 : Archive events older than N days}
        {--chunk=1000 : Number of rows per chunk}
        {--channel= : Filter by audit channel}
        {--dry-run : Show result without writing/deleting records}';

    protected $description = 'Archive old audit events to JSONL and optionally delete archived rows.';

    public function handle(): int
    {
        $days = max((int) $this->option('days'), 1);
        $chunk = max((int) $this->option('chunk'), 100);
        $channel = $this->option('channel');
        $dryRun = (bool) $this->option('dry-run');

        $cutoff = now()->subDays($days);

        $query = AuditEvent::query()
            ->where('created_at', '<', $cutoff)
            ->orderBy('created_at');

        if (is_string($channel) && $channel !== '') {
            $query->where('channel', $channel);
        }

        $total = (clone $query)->count();

        if ($total === 0) {
            $this->info('No audit events matched for archive.');

            return self::SUCCESS;
        }

        $timestamp = Carbon::now()->format('Ymd-His');
        $path = "audit-archives/audit-events-{$timestamp}.jsonl";
        $disk = Storage::disk('local');

        if (! $dryRun) {
            $disk->put($path, '');
        }

        $archived = 0;
        $deleted = 0;

        $query->chunkById($chunk, function ($events) use ($disk, $path, $dryRun, &$archived, &$deleted): void {
            $ids = [];
            $lines = [];

            /** @var AuditEvent $event */
            foreach ($events as $event) {
                $payload = [
                    'id' => $event->id,
                    'tenant_id' => $event->tenant_id,
                    'user_id' => $event->user_id,
                    'outlet_id' => $event->outlet_id,
                    'event_key' => $event->event_key,
                    'channel' => $event->channel,
                    'entity_type' => $event->entity_type,
                    'entity_id' => $event->entity_id,
                    'request_id' => $event->request_id,
                    'ip_address' => $event->ip_address,
                    'metadata' => $event->metadata_json,
                    'created_at' => $event->created_at?->toIso8601String(),
                ];

                $lines[] = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $ids[] = $event->id;
            }

            $archived += count($ids);

            if ($dryRun) {
                return;
            }

            $disk->append($path, implode("\n", $lines));
            $deleted += AuditEvent::query()->whereIn('id', $ids)->delete();
        });

        $this->info("Archive summary: matched={$total}, archived={$archived}, deleted={$deleted}, dry_run=".($dryRun ? 'yes' : 'no'));

        if (! $dryRun) {
            $this->info("Archive file: storage/app/{$path}");
        }

        return self::SUCCESS;
    }
}
