<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncMutation extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'device_id',
        'mutation_id',
        'seq',
        'type',
        'outlet_id',
        'entity_type',
        'entity_id',
        'payload_json',
        'client_time',
        'status',
        'reason_code',
        'message',
        'server_cursor',
        'effects',
        'processed_at',
        'created_by',
        'updated_by',
        'source_channel',
    ];

    protected function casts(): array
    {
        return [
            'payload_json' => 'array',
            'effects' => 'array',
            'client_time' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
