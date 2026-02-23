<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Service extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tenant_id',
        'name',
        'service_type',
        'parent_service_id',
        'is_group',
        'unit_type',
        'display_unit',
        'base_price_amount',
        'duration_days',
        'package_quota_value',
        'package_quota_unit',
        'package_valid_days',
        'package_accumulation_mode',
        'active',
        'sort_order',
        'image_icon',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'is_group' => 'boolean',
            'duration_days' => 'integer',
            'package_quota_value' => 'decimal:2',
            'package_valid_days' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Service::class, 'parent_service_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Service::class, 'parent_service_id')->orderBy('sort_order')->orderBy('name');
    }

    public function outletServices(): HasMany
    {
        return $this->hasMany(OutletService::class);
    }

    public function processTags(): BelongsToMany
    {
        return $this->belongsToMany(ServiceProcessTag::class, 'service_process_tag_links', 'service_id', 'tag_id')
            ->withPivot('sort_order')
            ->withTimestamps()
            ->orderByPivot('sort_order');
    }
}
