<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Tenant extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'slug',
        'current_plan_id',
        'current_subscription_cycle_id',
        'status',
        'subscription_state',
        'write_access_mode',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $tenant): void {
            if (blank($tenant->slug)) {
                $tenant->slug = self::generateUniqueSlug((string) $tenant->name);
            }
        });

        static::saving(function (self $tenant): void {
            if (blank($tenant->slug)) {
                $tenant->slug = self::generateUniqueSlug((string) $tenant->name, $tenant->id);
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'slug';
    }

    public function resolveRouteBinding($value, $field = null): ?self
    {
        $field = $field ?? $this->getRouteKeyName();

        $tenant = $this->newQuery()->where($field, $value)->first();

        if ($tenant || $field !== 'slug') {
            return $tenant;
        }

        return $this->newQuery()->whereKey($value)->first();
    }

    public function __toString(): string
    {
        return (string) $this->getRouteKey();
    }

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

    public function subscriptionPaymentIntents(): HasMany
    {
        return $this->hasMany(SubscriptionPaymentIntent::class);
    }

    public function subscriptionPaymentEvents(): HasMany
    {
        return $this->hasMany(SubscriptionPaymentEvent::class);
    }

    private static function generateUniqueSlug(string $name, ?string $ignoreTenantId = null): string
    {
        $base = Str::slug($name);
        $base = $base !== '' ? $base : 'tenant';
        $base = substr($base, 0, 72);
        $candidate = $base;
        $counter = 1;

        while (
            self::query()
                ->when($ignoreTenantId, fn ($query) => $query->where('id', '!=', $ignoreTenantId))
                ->where('slug', $candidate)
                ->exists()
        ) {
            $suffix = '-'.$counter;
            $candidate = substr($base, 0, max(72 - strlen($suffix), 1)).$suffix;
            $counter++;
        }

        return $candidate;
    }
}
