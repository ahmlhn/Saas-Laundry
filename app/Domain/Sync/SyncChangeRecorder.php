<?php

namespace App\Domain\Sync;

use App\Models\SyncChange;
use Illuminate\Support\Str;

class SyncChangeRecorder
{
    /**
     * @param array<string, mixed>|null $data
     */
    public function record(
        string $tenantId,
        ?string $outletId,
        string $entityType,
        string $entityId,
        string $op,
        ?array $data,
    ): SyncChange {
        return SyncChange::query()->create([
            'change_id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'outlet_id' => $outletId,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'op' => $op,
            'data_json' => $data,
        ]);
    }
}
