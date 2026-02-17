<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoiceLease extends Model
{
    use HasFactory, HasUuids;

    protected $primaryKey = 'lease_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'lease_id',
        'tenant_id',
        'outlet_id',
        'device_id',
        'date',
        'prefix',
        'from_counter',
        'to_counter',
        'next_counter',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'expires_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function outlet(): BelongsTo
    {
        return $this->belongsTo(Outlet::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
