<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionVoucher extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'promotion_id',
        'code',
        'quota_total',
        'quota_used',
        'per_customer_limit',
        'active',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'quota_total' => 'integer',
            'quota_used' => 'integer',
            'per_customer_limit' => 'integer',
            'active' => 'boolean',
            'expires_at' => 'datetime',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
