<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncChange extends Model
{
    use HasFactory;

    protected $primaryKey = 'cursor';

    public $incrementing = true;

    protected $keyType = 'int';

    protected $fillable = [
        'change_id',
        'tenant_id',
        'outlet_id',
        'entity_type',
        'entity_id',
        'op',
        'data_json',
    ];

    protected function casts(): array
    {
        return [
            'data_json' => 'array',
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
}
