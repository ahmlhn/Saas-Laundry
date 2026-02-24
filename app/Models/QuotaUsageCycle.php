<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuotaUsageCycle extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'quota_usage_cycles';

    protected $fillable = [
        'tenant_id',
        'cycle_id',
        'orders_limit_snapshot',
        'orders_used',
        'last_reconciled_at',
    ];

    protected function casts(): array
    {
        return [
            'last_reconciled_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(SubscriptionCycle::class, 'cycle_id');
    }
}
