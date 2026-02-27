<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrinterNoteSetting extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'tenant_id',
        'outlet_id',
        'profile_name',
        'description_line',
        'phone',
        'numbering_mode',
        'custom_prefix',
        'footer_note',
        'share_enota',
        'show_customer_receipt',
        'paper_width',
        'auto_cut',
        'auto_open_cash_drawer',
        'logo_path',
    ];

    protected function casts(): array
    {
        return [
            'share_enota' => 'boolean',
            'show_customer_receipt' => 'boolean',
            'auto_cut' => 'boolean',
            'auto_open_cash_drawer' => 'boolean',
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
}
