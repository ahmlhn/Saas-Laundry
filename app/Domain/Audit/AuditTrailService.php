<?php

namespace App\Domain\Audit;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Http\Request;

class AuditTrailService
{
    /**
     * @param array<string, mixed> $metadata
     */
    public function record(
        string $eventKey,
        ?User $actor = null,
        ?string $tenantId = null,
        ?string $outletId = null,
        ?string $entityType = null,
        ?string $entityId = null,
        array $metadata = [],
        string $channel = 'api',
        ?Request $request = null,
    ): AuditEvent {
        $request = $request ?: request();

        return AuditEvent::query()->create([
            'tenant_id' => $tenantId ?? $actor?->tenant_id,
            'user_id' => $actor?->id,
            'outlet_id' => $outletId,
            'event_key' => $eventKey,
            'channel' => $channel,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'request_id' => $request?->attributes->get('request_id') ?: $request?->header('X-Request-Id'),
            'ip_address' => $request?->ip(),
            'metadata_json' => $metadata,
        ]);
    }
}
