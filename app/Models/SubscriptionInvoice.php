<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SubscriptionInvoice extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tenant_id',
        'cycle_id',
        'invoice_no',
        'amount_total',
        'currency',
        'tax_included',
        'payment_method',
        'gateway_provider',
        'gateway_reference',
        'qris_payload',
        'qris_expired_at',
        'gateway_status',
        'gateway_paid_amount',
        'gateway_updated_at',
        'issued_at',
        'due_at',
        'status',
        'paid_verified_at',
        'verified_by',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'tax_included' => 'boolean',
            'qris_expired_at' => 'datetime',
            'gateway_updated_at' => 'datetime',
            'issued_at' => 'datetime',
            'due_at' => 'datetime',
            'paid_verified_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(SubscriptionCycle::class, 'cycle_id');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function proofs(): HasMany
    {
        return $this->hasMany(SubscriptionPaymentProof::class, 'invoice_id');
    }

    public function paymentIntents(): HasMany
    {
        return $this->hasMany(SubscriptionPaymentIntent::class, 'invoice_id');
    }

    public function paymentEvents(): HasMany
    {
        return $this->hasMany(SubscriptionPaymentEvent::class, 'invoice_id');
    }
}
