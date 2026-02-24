<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    use HasFactory;

    protected $fillable = [
        'key',
        'name',
        'orders_limit',
        'monthly_price_amount',
        'currency',
        'is_active',
        'display_order',
    ];

    public function tenants(): HasMany
    {
        return $this->hasMany(Tenant::class, 'current_plan_id');
    }

    public function subscriptionCycles(): HasMany
    {
        return $this->hasMany(SubscriptionCycle::class);
    }

    public function subscriptionChangeRequests(): HasMany
    {
        return $this->hasMany(SubscriptionChangeRequest::class, 'target_plan_id');
    }
}
