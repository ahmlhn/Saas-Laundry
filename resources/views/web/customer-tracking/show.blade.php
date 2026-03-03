<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} {{ $invoiceLabel }}</title>
    @include('partials.vite-assets')
    <style>
        :root{color-scheme:light;--bg:#f4f7fb;--card:#fff;--line:#dbe3ee;--text:#172033;--muted:#64748b;--brand:#0f766e;--brand-soft:#e8f5f3;--warn:#9a5c00;--warn-soft:#fff5e7;--shadow:0 16px 40px rgba(15,23,42,.08);--radius:20px}
        *{box-sizing:border-box}
        body{margin:0;min-height:100vh;background:linear-gradient(180deg,#f8fbff 0%,var(--bg) 100%);font-family:"Manrope","Segoe UI",sans-serif;color:var(--text)}
        .shell{width:min(760px,calc(100vw - 24px));margin:0 auto;padding:20px 0 32px}
        .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
        .header{padding:24px}
        .eyebrow{margin:0 0 8px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
        h1,h2,h3,p{margin:0}
        .title-row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
        .title{font-size:clamp(1.7rem,5vw,2.4rem);line-height:1.02;letter-spacing:-.04em}
        .status-badge{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 14px;border-radius:999px;font:inherit;font-weight:800}
        .status-badge{background:var(--brand-soft);color:var(--brand);border:1px solid #c8e3de}
        .subtitle{margin-top:14px;color:var(--muted);font-size:14px;line-height:1.6}
        .note{margin-top:16px;padding:14px 16px;border-radius:16px;border:1px solid #c8e3de;background:#f6fbfa;font-size:14px;line-height:1.6}
        .note.warn{border-color:#efd5a8;background:var(--warn-soft);color:var(--warn)}
        .stack{display:grid;gap:16px;margin-top:16px}
        .section{padding:20px}
        .section-title{font-size:1.05rem;letter-spacing:-.02em}
        .section-copy{margin-top:4px;color:var(--muted);font-size:14px}
        .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
        .summary-item{padding:14px;border:1px solid var(--line);border-radius:16px;background:#fbfcff;min-width:0}
        .summary-item span{display:block;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
        .summary-item strong{display:block;margin-top:6px;font-size:16px;line-height:1.3;overflow-wrap:anywhere}
        .item-list{display:grid;gap:10px;margin-top:16px}
        .item-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:1px solid var(--line);border-radius:16px;background:#fbfcff}
        .item-row strong{display:block;font-size:15px;line-height:1.35}
        .item-meta{margin-top:4px;color:var(--muted);font-size:13px}
        .item-price{font-size:15px;font-weight:800;text-align:right;align-self:center}
        .total-box{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-top:14px;padding:14px 16px;border-radius:16px;background:#f6fbfa;border:1px solid #c8e3de}
        .total-box span{color:var(--muted);font-size:13px}
        .total-box strong{font-size:20px;letter-spacing:-.03em}
        .link-box{margin-top:14px;padding:12px 14px;border-radius:14px;background:#f8fafc;border:1px dashed #cbd5e1;font-size:13px;font-weight:700;overflow-wrap:anywhere}
        @media (max-width:640px){
            .shell{width:calc(100vw - 16px);padding:12px 0 24px}
            .header,.section{padding:16px}
            .title-row,.total-box{flex-direction:column;align-items:flex-start}
            .summary-grid{grid-template-columns:1fr}
            .item-row{grid-template-columns:1fr}
            .item-price{text-align:left}
        }
    </style>
</head>
<body>
    @php
        $lastPayment = $order->payments->sortByDesc('paid_at')->first();
        $itemSubtotal = (int) $order->items->sum(fn ($item) => (int) $item->subtotal_amount);
        $progressLabel = $statusLabel($order->laundry_status);
        $paymentNote = $order->due_amount > 0
            ? 'Masih ada sisa pembayaran yang bisa dilunasi ke outlet.'
            : 'Pembayaran sudah lengkap.';
    @endphp

    <main class="shell">
        <section class="card header">
            <p class="eyebrow">Lacak Pesanan</p>
            <div class="title-row">
                <div>
                    <h1 class="title">{{ $invoiceLabel }}</h1>
                    <p class="subtitle">
                        Halo {{ $order->customer?->name ?: 'Pelanggan' }}, status pesanan Anda saat ini
                        <strong>{{ $progressLabel }}</strong>.
                    </p>
                </div>
                <span class="status-badge">{{ $paymentStatusLabel }}</span>
            </div>
            <div class="note {{ $order->due_amount > 0 ? 'warn' : '' }}">
                <strong>Status laundry:</strong> {{ $statusLabel($order->laundry_status) }}.
                {{ $paymentNote }}
            </div>
        </section>

        <div class="stack">
            <section class="card section">
                <h2 class="section-title">Ringkasan Pesanan</h2>
                <p class="section-copy">Informasi inti order yang sedang diproses.</p>
                <div class="summary-grid">
                    <div class="summary-item">
                        <span>Pelanggan</span>
                        <strong>{{ $order->customer?->name ?: '-' }}</strong>
                    </div>
                    <div class="summary-item">
                        <span>Outlet</span>
                        <strong>{{ $order->outlet?->name ?: '-' }}</strong>
                    </div>
                    <div class="summary-item">
                        <span>Dibuat</span>
                        <strong>{{ $order->created_at?->format('d M Y H:i') ?: '-' }}</strong>
                    </div>
                    <div class="summary-item">
                        <span>Pembayaran</span>
                        <strong>{{ $paymentStatusLabel }}</strong>
                    </div>
                    @if($order->is_pickup_delivery)
                        <div class="summary-item">
                            <span>Jemput</span>
                            <strong>{{ data_get($order->pickup, 'address_short') ?: data_get($order->pickup, 'address') ?: '-' }}</strong>
                        </div>
                        <div class="summary-item">
                            <span>Antar</span>
                            <strong>{{ data_get($order->delivery, 'address_short') ?: data_get($order->delivery, 'address') ?: '-' }}</strong>
                        </div>
                    @endif
                </div>
                @if(filled($order->notes))
                    <div class="note">
                        <strong>Catatan:</strong> {{ $order->notes }}
                    </div>
                @endif
            </section>

            <section class="card section">
                <h2 class="section-title">Item Pesanan</h2>
                <p class="section-copy">Daftar layanan yang tercatat pada order ini.</p>
                <div class="item-list">
                    @forelse($order->items as $item)
                        <div class="item-row">
                            <div>
                                <strong>{{ $item->service_name_snapshot }}</strong>
                                <p class="item-meta">
                                    {{ $item->unit_type_snapshot }}
                                    · Qty {{ number_format((float) ($item->qty ?? 0), 2) }}
                                    @if($item->weight_kg !== null)
                                        · {{ number_format((float) $item->weight_kg, 2) }} kg
                                    @endif
                                </p>
                            </div>
                            <div class="item-price">Rp{{ number_format((int) $item->subtotal_amount) }}</div>
                        </div>
                    @empty
                        <div class="item-row">
                            <div>
                                <strong>Belum ada item layanan tercatat.</strong>
                            </div>
                        </div>
                    @endforelse
                </div>
                <div class="total-box">
                    <span>
                        Subtotal Rp{{ number_format($itemSubtotal) }} · Antar Rp{{ number_format((int) $order->shipping_fee_amount) }}
                        · Diskon Rp{{ number_format((int) $order->discount_amount) }}
                        @if($lastPayment?->paid_at)
                            · Pembayaran terakhir {{ $lastPayment->paid_at->format('d M Y H:i') }}
                        @endif
                    </span>
                    <strong>Rp{{ number_format((int) $order->total_amount) }}</strong>
                </div>
            </section>

            <section class="card section">
                <h2 class="section-title">Butuh Bantuan?</h2>
                <p class="section-copy">
                    Hubungi outlet <strong>{{ $order->outlet?->name ?: '-' }}</strong>
                    @if(filled($order->outlet?->address))
                        di {{ $order->outlet?->address }}
                    @endif
                    dan sebutkan referensi <strong>{{ $invoiceLabel }}</strong>.
                </p>
                <div class="link-box">{{ $trackingUrl }}</div>
            </section>
        </div>
    </main>

</body>
</html>
