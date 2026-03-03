<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} {{ $invoiceLabel }}</title>
    @include('partials.vite-assets')
    <style>
        :root{color-scheme:light;--bg:#f3f6fb;--card:#fff;--line:#dbe3ef;--text:#182235;--muted:#66758c;--brand:#0f766e;--brand-soft:#e9f7f4;--warn:#9a5c00;--warn-soft:#fff4e5;--shadow:0 12px 30px rgba(15,23,42,.08);--radius:18px}
        *{box-sizing:border-box}
        body{margin:0;min-height:100vh;background:linear-gradient(180deg,#f8fbff 0%,var(--bg) 100%);font-family:"Manrope","Segoe UI",sans-serif;color:var(--text)}
        h1,h2,p{margin:0}
        .shell{width:min(680px,calc(100vw - 20px));margin:0 auto;padding:14px 0 24px}
        .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
        .hero{padding:20px}
        .brand-mark{display:flex;justify-content:center;margin-bottom:14px}
        .brand-mark img{display:block;max-width:min(180px,48vw);max-height:72px;width:auto;height:auto;object-fit:contain}
        .eyebrow{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
        .invoice{margin-top:8px;font-size:clamp(1.7rem,5vw,2.2rem);line-height:1.02;letter-spacing:-.04em}
        .headline{margin-top:10px;font-size:15px;line-height:1.6;color:var(--muted)}
        .status-box{margin-top:16px;padding:16px;border-radius:16px;background:var(--brand-soft);border:1px solid #c8e4de}
        .status-box.warn{background:var(--warn-soft);border-color:#efd3a2;color:var(--warn)}
        .status-label{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .status-value{margin-top:6px;font-size:1.35rem;font-weight:800;letter-spacing:-.03em}
        .status-note{margin-top:6px;font-size:14px;line-height:1.6}
        .stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
        .stat{padding:14px;border:1px solid var(--line);border-radius:14px;background:#fbfcff;min-width:0}
        .stat span{display:block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        .stat strong{display:block;margin-top:6px;font-size:15px;line-height:1.35;overflow-wrap:anywhere}
        .section{margin-top:12px;padding:18px}
        .section-title{font-size:1rem;letter-spacing:-.02em}
        .section-copy{margin-top:4px;font-size:14px;color:var(--muted)}
        .items{display:grid;gap:10px;margin-top:14px}
        .item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:1px solid var(--line);border-radius:14px;background:#fbfcff}
        .item strong{display:block;font-size:15px;line-height:1.35}
        .item small{display:block;margin-top:4px;font-size:13px;color:var(--muted)}
        .price{align-self:center;font-size:15px;font-weight:800;text-align:right}
        .total{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-top:12px;padding:14px;border-radius:14px;background:#f8fafc;border:1px solid var(--line)}
        .total span{font-size:13px;color:var(--muted);line-height:1.6}
        .total strong{font-size:1.15rem;letter-spacing:-.03em}
        .footer{margin-top:12px;padding:16px 18px;font-size:14px;line-height:1.7;color:var(--muted)}
        .footer strong{color:var(--text)}
        @media (max-width:560px){
            .shell{width:calc(100vw - 14px);padding:10px 0 20px}
            .hero,.section,.footer{padding:16px}
            .stats{grid-template-columns:1fr}
            .item{grid-template-columns:1fr}
            .price{text-align:left}
            .total{flex-direction:column}
        }
    </style>
</head>
<body>
    @php
        $lastPayment = $order->payments->sortByDesc('paid_at')->first();
        $progressLabel = $statusLabel($order->laundry_status);
        $paymentNote = $order->due_amount > 0
            ? 'Masih ada sisa pembayaran.'
            : 'Pembayaran sudah lengkap.';
        $itemSubtotal = (int) $order->items->sum(fn ($item) => (int) $item->subtotal_amount);
    @endphp

    <main class="shell">
        <section class="card hero">
            @if($outletLogoUrl)
                <div class="brand-mark">
                    <img src="{{ $outletLogoUrl }}" alt="Logo {{ $order->outlet?->name ?: 'outlet' }}">
                </div>
            @endif
            <p class="eyebrow">Lacak Pesanan</p>
            <h1 class="invoice">{{ $invoiceLabel }}</h1>
            <p class="headline">
                Halo {{ $order->customer?->name ?: 'Pelanggan' }}, pesanan Anda saat ini
                <strong>{{ $progressLabel }}</strong>.
            </p>

            <div class="status-box {{ $order->due_amount > 0 ? 'warn' : '' }}">
                <div class="status-label">Status Saat Ini</div>
                <div class="status-value">{{ $progressLabel }}</div>
                <p class="status-note">{{ $paymentStatusLabel }}. {{ $paymentNote }}</p>
            </div>

            <div class="stats">
                <div class="stat">
                    <span>Total Tagihan</span>
                    <strong>Rp{{ number_format((int) $order->total_amount) }}</strong>
                </div>
                <div class="stat">
                    <span>Sisa Pembayaran</span>
                    <strong>Rp{{ number_format((int) $order->due_amount) }}</strong>
                </div>
                <div class="stat">
                    <span>Outlet</span>
                    <strong>{{ $order->outlet?->name ?: '-' }}</strong>
                </div>
                <div class="stat">
                    <span>Dibuat</span>
                    <strong>{{ $order->created_at?->format('d M Y H:i') ?: '-' }}</strong>
                </div>
            </div>
        </section>

        <section class="card section">
            <h2 class="section-title">Item Pesanan</h2>
            <p class="section-copy">Daftar layanan pada order ini.</p>
            <div class="items">
                @forelse($order->items as $item)
                    <div class="item">
                        <div>
                            <strong>{{ $item->service_name_snapshot }}</strong>
                            <small>
                                {{ $item->unit_type_snapshot }}
                                · Qty {{ number_format((float) ($item->qty ?? 0), 2) }}
                                @if($item->weight_kg !== null)
                                    · {{ number_format((float) $item->weight_kg, 2) }} kg
                                @endif
                            </small>
                        </div>
                        <div class="price">Rp{{ number_format((int) $item->subtotal_amount) }}</div>
                    </div>
                @empty
                    <div class="item">
                        <div>
                            <strong>Belum ada item layanan tercatat.</strong>
                        </div>
                    </div>
                @endforelse
            </div>

            <div class="total">
                <span>
                    Subtotal Rp{{ number_format($itemSubtotal) }}
                    · Antar Rp{{ number_format((int) $order->shipping_fee_amount) }}
                    · Diskon Rp{{ number_format((int) $order->discount_amount) }}
                    @if($lastPayment?->paid_at)
                        · Bayar terakhir {{ $lastPayment->paid_at->format('d M Y H:i') }}
                    @endif
                </span>
                <strong>Rp{{ number_format((int) $order->total_amount) }}</strong>
            </div>
        </section>

        <section class="card footer">
            <strong>{{ $order->outlet?->name ?: 'Outlet' }}</strong>
            @if(filled($order->outlet?->address))
                · {{ $order->outlet->address }}
            @endif
            · Referensi {{ $invoiceLabel }}
            @if(filled($order->notes))
                <br>Catatan: {{ $order->notes }}
            @endif
            @if($order->is_pickup_delivery)
                <br>Pickup & delivery aktif untuk order ini.
            @endif
        </section>
    </main>
</body>
</html>
