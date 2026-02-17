<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WaProvider extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'name',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    public function configs(): HasMany
    {
        return $this->hasMany(WaProviderConfig::class, 'provider_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(WaMessage::class, 'provider_id');
    }
}
