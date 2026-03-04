<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Order extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tenant_id',
        'outlet_id',
        'customer_id',
        'invoice_no',
        'order_code',
        'tracking_token',
        'is_pickup_delivery',
        'requires_pickup',
        'requires_delivery',
        'laundry_status',
        'courier_status',
        'courier_user_id',
        'shipping_fee_amount',
        'discount_amount',
        'total_amount',
        'paid_amount',
        'due_amount',
        'pickup',
        'delivery',
        'notes',
        'created_by',
        'updated_by',
        'source_channel',
        'collection_status',
        'collection_last_contacted_at',
        'collection_next_follow_up_at',
        'collection_note',
    ];

    protected function casts(): array
    {
        return [
            'is_pickup_delivery' => 'boolean',
            'requires_pickup' => 'boolean',
            'requires_delivery' => 'boolean',
            'pickup' => 'array',
            'delivery' => 'array',
            'collection_last_contacted_at' => 'datetime',
            'collection_next_follow_up_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function outlet(): BelongsTo
    {
        return $this->belongsTo(Outlet::class)->withTrashed();
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class)->withTrashed();
    }

    public function courier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'courier_user_id')->withTrashed();
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    protected static function booted(): void
    {
        static::creating(function (self $order): void {
            if (! filled($order->tracking_token)) {
                $order->tracking_token = self::generateTrackingToken();
            }
        });

        static::saving(function (self $order): void {
            $requiresPickup = $order->getAttribute('requires_pickup');
            $requiresDelivery = $order->getAttribute('requires_delivery');

            if ($order->is_pickup_delivery && $requiresPickup === null && $requiresDelivery === null) {
                $order->requires_pickup = true;
                $order->requires_delivery = true;
            }

            if (! $order->requires_pickup && ! $order->requires_delivery) {
                $order->is_pickup_delivery = false;
                return;
            }

            $order->is_pickup_delivery = true;
        });
    }

    public static function generateTrackingToken(): string
    {
        do {
            $token = Str::lower(Str::random(24));
        } while (self::query()->where('tracking_token', $token)->exists());

        return $token;
    }
}
