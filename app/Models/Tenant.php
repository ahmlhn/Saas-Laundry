<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'current_plan_id',
        'current_subscription_cycle_id',
        'status',
        'subscription_state',
        'write_access_mode',
    ];

    public function currentPlan(): BelongsTo
    {
        return $this->belongsTo(Plan::class, 'current_plan_id');
    }

    public function currentSubscriptionCycle(): BelongsTo
    {
        return $this->belongsTo(SubscriptionCycle::class, 'current_subscription_cycle_id');
    }

    public function outlets(): HasMany
    {
        return $this->hasMany(Outlet::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function subscriptionCycles(): HasMany
    {
        return $this->hasMany(SubscriptionCycle::class);
    }

    public function subscriptionInvoices(): HasMany
    {
        return $this->hasMany(SubscriptionInvoice::class);
    }

    public function subscriptionChangeRequests(): HasMany
    {
        return $this->hasMany(SubscriptionChangeRequest::class);
    }
}
