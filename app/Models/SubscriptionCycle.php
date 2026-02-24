<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SubscriptionCycle extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tenant_id',
        'plan_id',
        'orders_limit_snapshot',
        'status',
        'cycle_start_at',
        'cycle_end_at',
        'activated_at',
        'auto_renew',
        'source',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'cycle_start_at' => 'datetime',
            'cycle_end_at' => 'datetime',
            'activated_at' => 'datetime',
            'auto_renew' => 'boolean',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function usage(): HasOne
    {
        return $this->hasOne(QuotaUsageCycle::class, 'cycle_id');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SubscriptionInvoice::class, 'cycle_id');
    }

    public function changeRequests(): HasMany
    {
        return $this->hasMany(SubscriptionChangeRequest::class, 'current_cycle_id');
    }
}
