<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} {{ $invoiceLabel }}</title>
    @include('partials.vite-assets')
    <style>
        :root{color-scheme:light;--bg:#ecf3fb;--card:#ffffffea;--line:#d9e3ee;--text:#0f172a;--muted:#566579;--soft:#7a889d;--brand:#0f766e;--brand-soft:#e7f6f3;--blue:#0f5da8;--blue-soft:#ebf4ff;--warn:#915700;--warn-soft:#fff5e6;--shadow:0 24px 60px rgba(15,23,42,.1);--r-xl:28px;--r-lg:22px;--r-md:18px;--r-sm:14px}
        *{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:"Manrope","Segoe UI",sans-serif;line-height:1.55;color:var(--text);background:radial-gradient(circle at top left,rgba(15,118,110,.14),transparent 28%),radial-gradient(circle at 85% 20%,rgba(37,99,235,.12),transparent 30%),linear-gradient(180deg,#f6faff 0%,var(--bg) 38%,#e8f0f9 100%)}
        .shell{width:min(1120px,calc(100vw - 28px));margin:0 auto;padding:24px 0 40px}
        .topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;color:var(--muted);font-size:13px}
        .topbar-pills{display:flex;flex-wrap:wrap;gap:8px}.pill,.copy-btn,.unit-pill,.chip{display:inline-flex;align-items:center;border-radius:999px;font-weight:800}
        .pill{padding:7px 11px;border:1px solid #d8e2ee;background:#ffffffc7}
        .copy-btn{gap:8px;padding:9px 13px;border:1px solid #b6d8d2;background:var(--brand-soft);color:var(--brand);font:inherit;cursor:pointer}
        .card{background:var(--card);border:1px solid #dbe4ef;border-radius:var(--r-xl);box-shadow:var(--shadow);backdrop-filter:blur(12px)}
        .hero{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:18px;margin-bottom:18px}
        .hero-main{position:relative;overflow:hidden;padding:30px;background:radial-gradient(circle at right top,rgba(37,99,235,.14),transparent 34%),radial-gradient(circle at left bottom,rgba(15,118,110,.12),transparent 30%),#fff}
        .hero-main:after{content:"";position:absolute;right:-22px;top:-18px;width:170px;height:170px;border-radius:40px;background:linear-gradient(145deg,rgba(15,118,110,.12),rgba(37,99,235,.08));transform:rotate(18deg)}
        .kicker,.section-kicker{margin:0;text-transform:uppercase;letter-spacing:.1em;font-size:12px;font-weight:800}
        .kicker{position:relative;z-index:1;color:var(--brand);margin-bottom:10px}.section-kicker{color:var(--soft);margin-bottom:5px}
        .title{position:relative;z-index:1;margin:0;max-width:12ch;font-size:clamp(2rem,4.5vw,3.3rem);line-height:.98;letter-spacing:-.06em}
        .lead{position:relative;z-index:1;margin:14px 0 0;max-width:55ch;color:var(--muted);font-size:15px}
        .chip-row{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
        .chip{gap:8px;min-height:40px;padding:0 14px;border:1px solid #dce4ee;background:#ffffffd1;color:#243041;font-size:13px}
        .chip-dot{width:8px;height:8px;border-radius:999px;background:currentColor}.chip.brand{color:var(--brand);background:var(--brand-soft);border-color:#c6e6e0}.chip.info{color:var(--blue);background:var(--blue-soft);border-color:#cfe2ff}.chip.warn{color:var(--warn);background:var(--warn-soft);border-color:#efd7ad}
        .hero-side{display:grid;gap:14px;padding:22px;background:radial-gradient(circle at top,rgba(45,212,191,.16),transparent 34%),linear-gradient(170deg,#091626,#0f1e34);color:#e2e8f0}
        .side-box{padding:16px;border:1px solid rgba(191,219,254,.14);border-radius:var(--r-lg);background:rgba(148,163,184,.08)}
        .side-box span,.label{display:block;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .side-box span{color:#b8c6d9}.side-box strong{display:block;margin-top:6px;font-size:22px;line-height:1.1;letter-spacing:-.04em;color:#fff}.side-box p,.section-copy,.meta small,.note,.footer-note,.address-card p{margin:7px 0 0;color:#d8e2ee;font-size:13px}
        .main-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);gap:18px}
        .stack{display:grid;gap:18px}.section{padding:24px}.section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:18px}
        .section-head h2,.cta-box h3{margin:0;letter-spacing:-.03em}.section-head h2{font-size:1.2rem}.section-copy{color:var(--muted);font-size:14px}
        .progress-shell{padding:18px;border:1px solid var(--line);border-radius:var(--r-lg);background:linear-gradient(180deg,#fff,#fbfcff)}
        .progress{position:relative;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
        .progress:before{content:"";position:absolute;left:28px;right:28px;top:20px;height:2px;background:linear-gradient(90deg,rgba(15,118,110,.18),rgba(37,99,235,.1));z-index:0}
        .step{position:relative;z-index:1;display:grid;justify-items:center;gap:8px;text-align:center}
        .step-badge{width:42px;height:42px;display:grid;place-items:center;border-radius:999px;border:1px solid #dae3ee;background:#f6f9fd;color:#607086;font-size:14px;font-weight:800;box-shadow:0 0 0 7px #edf4fb}
        .step.done .step-badge{background:linear-gradient(180deg,#14b8a6,#0f766e);border-color:#9fd7cf;color:#fff}.step.active .step-badge{background:linear-gradient(180deg,#3b82f6,#0f5da8);border-color:#b9d5ff;color:#fff;box-shadow:0 0 0 7px rgba(59,130,246,.12)}
        .step strong{display:block;font-size:13px}.step p{margin:0;color:var(--soft);font-size:12px;line-height:1.35}
        .summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.meta,.address-card,.cta-box{padding:16px;border:1px solid var(--line);border-radius:var(--r-md);background:linear-gradient(180deg,#fff,#fbfdff)}
        .meta strong,.address-card strong{display:block;margin-top:6px;font-size:17px;line-height:1.2;color:var(--text)}.meta small,.address-card p{color:var(--muted)}
        .note{padding:15px 16px;border-radius:var(--r-md);border:1px solid #c6e6e0;background:linear-gradient(180deg,#edf8f6,#f8fcfb);color:#154441}.note.warn{border-color:#efd7ad;background:linear-gradient(180deg,#fff7ea,#fffdfa);color:#7a4200}.note strong{font-weight:800}
        .address-grid,.cta-stack{display:grid;gap:12px}.table-wrap{overflow:hidden;border:1px solid var(--line);border-radius:var(--r-lg);background:#fff}
        table{width:100%;border-collapse:collapse}th,td{padding:13px 14px;border-bottom:1px solid #e6edf5;text-align:left;vertical-align:top;font-size:14px}th{background:#f8fbff;color:var(--soft);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}tr:last-child td{border-bottom:0}
        .service-name{font-weight:800}.unit-pill{min-height:28px;padding:0 10px;background:#eef4fb;border:1px solid #d7e2ef;color:#44556c;font-size:12px}
        .total-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;padding:15px 16px;border-radius:var(--r-md);border:1px solid #c6e6e0;background:linear-gradient(180deg,#edf8f6,#f7fbfd)}
        .total-row span{color:var(--muted);font-size:13px;font-weight:700}.total-row strong{font-size:20px;letter-spacing:-.03em}
        .link-box{margin-top:10px;padding:12px 13px;border-radius:var(--r-sm);background:#f7fbff;border:1px dashed #c9d8e8;font-size:13px;font-weight:700;word-break:break-all}
        @media (max-width:1024px){.hero,.main-grid{grid-template-columns:1fr}}
        @media (max-width:820px){.progress{grid-template-columns:1fr;gap:14px}.progress:before{left:20px;top:24px;bottom:24px;right:auto;width:2px;height:auto;background:linear-gradient(180deg,rgba(15,118,110,.18),rgba(37,99,235,.1))}.step{grid-template-columns:42px 1fr;justify-items:start;align-items:center;text-align:left}.step-copy{display:grid;gap:2px}}
        @media (max-width:720px){.shell{width:min(100vw - 18px,100%);padding:16px 0 28px}.topbar,.section-head,.total-row{flex-direction:column;align-items:flex-start}.hero-main,.hero-side,.section{padding:18px}.summary-grid{grid-template-columns:1fr}}
    </style>
</head>
<body>
    @php
        $pickup = $order->pickup ?? [];
        $delivery = $order->delivery ?? [];
        $lastPayment = $order->payments->sortByDesc('paid_at')->first();
        $itemSubtotal = (int) $order->items->sum(fn ($item) => (int) $item->subtotal_amount);
        $progressLabel = $statusLabel($order->laundry_status);
        $paymentNote = $order->due_amount > 0
            ? 'Masih ada sisa pembayaran yang bisa dilunasi saat pengambilan atau sesuai instruksi outlet.'
            : 'Pembayaran sudah lengkap dan pesanan siap mengikuti progres layanan.';
    @endphp

    <main class="shell">
        <section class="topbar">
            <div class="topbar-pills">
                <span class="pill">Halaman publik pelanggan</span>
                <span class="pill">{{ $order->tenant?->name ?: config('app.name', 'Cuci') }}</span>
                <span class="pill">Ref {{ $invoiceLabel }}</span>
            </div>
            <button class="copy-btn" id="copyTrackingLink" type="button">Salin Link Tracking</button>
        </section>

        <section class="hero">
            <article class="card hero-main">
                <p class="kicker">Lacak Pesanan</p>
                <h1 class="title">{{ $invoiceLabel }}</h1>
                <p class="lead">Halo {{ $order->customer?->name ?: 'Pelanggan' }}, status pesanan Anda saat ini <strong>{{ $progressLabel }}</strong>. Halaman ini menampilkan progres terbaru yang tercatat di sistem outlet.</p>
                <div class="chip-row">
                    <span class="chip brand"><span class="chip-dot"></span>Laundry {{ $statusLabel($order->laundry_status) }}</span>
                    <span class="chip info"><span class="chip-dot"></span>Kurir {{ $order->courier_status ? $statusLabel($order->courier_status) : 'tidak dipakai' }}</span>
                    <span class="chip {{ $order->due_amount > 0 ? 'warn' : 'brand' }}"><span class="chip-dot"></span>{{ $paymentStatusLabel }}</span>
                </div>
            </article>

            <aside class="card hero-side">
                <div class="side-box">
                    <span>Total Tagihan</span>
                    <strong>Rp{{ number_format((int) $order->total_amount) }}</strong>
                    <p>Dibayar Rp{{ number_format((int) $order->paid_amount) }} · Sisa Rp{{ number_format((int) $order->due_amount) }}</p>
                </div>
                <div class="side-box">
                    <span>Outlet Penanganan</span>
                    <strong>{{ $order->outlet?->name ?: '-' }}</strong>
                    <p>{{ $order->outlet?->code ?: '-' }} · {{ $order->outlet?->address ?: 'Alamat outlet belum dicatat.' }}</p>
                </div>
                <div class="side-box">
                    <span>Link Tracking Anda</span>
                    <strong style="font-size:15px;line-height:1.35;word-break:break-all;">{{ $trackingUrl }}</strong>
                    <p>Simpan tautan ini bila Anda ingin membuka status pesanan lagi tanpa harus meminta link baru.</p>
                </div>
            </aside>
        </section>

        <section class="main-grid">
            <div class="stack">
                <article class="card section">
                    <div class="section-head">
                        <div>
                            <p class="section-kicker">Progress</p>
                            <h2>Perjalanan Pesanan</h2>
                            <p class="section-copy">Posisi aktif, tahap yang sudah selesai, dan tahap berikutnya terlihat lebih jelas.</p>
                        </div>
                    </div>
                    <div class="progress-shell">
                        <div class="progress">
                            @foreach($statusMap as $index => $step)
                                @php($stepClass = $index < $currentStep ? 'done' : ($index === $currentStep ? 'active' : ''))
                                <div class="step {{ $stepClass }}">
                                    <div class="step-badge">{{ $index + 1 }}</div>
                                    <div class="step-copy">
                                        <strong>{{ $step['label'] }}</strong>
                                        <p>{{ $index < $currentStep ? 'Tahap selesai' : ($index === $currentStep ? 'Tahap aktif sekarang' : 'Menunggu proses') }}</p>
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    </div>
                    <div class="note {{ $order->due_amount > 0 ? 'warn' : '' }}">
                        <strong>Update terbaru:</strong> Status laundry Anda saat ini {{ $statusLabel($order->laundry_status) }}. {{ $paymentNote }}
                    </div>
                </article>

                <article class="card section">
                    <div class="section-head">
                        <div>
                            <p class="section-kicker">Rincian</p>
                            <h2>Ringkasan Pesanan</h2>
                            <p class="section-copy">Informasi inti dibuat lebih ringkas agar mudah dibaca pelanggan.</p>
                        </div>
                    </div>
                    <div class="summary-grid">
                        <div class="meta">
                            <span class="label">Pelanggan</span>
                            <strong>{{ $order->customer?->name ?: '-' }}</strong>
                            <small>{{ $order->customer?->phone_normalized ?: '-' }}</small>
                        </div>
                        <div class="meta">
                            <span class="label">Dibuat</span>
                            <strong>{{ $order->created_at?->format('d M Y H:i') ?: '-' }}</strong>
                            <small>Terakhir diperbarui {{ $order->updated_at?->format('d M Y H:i') ?: '-' }}</small>
                        </div>
                        <div class="meta">
                            <span class="label">Tipe Layanan</span>
                            <strong>{{ $order->is_pickup_delivery ? 'Pickup & Delivery' : 'Drop Off Outlet' }}</strong>
                            <small>Kurir {{ $order->courier?->name ?: '-' }}</small>
                        </div>
                        <div class="meta">
                            <span class="label">Pembayaran</span>
                            <strong>{{ $paymentStatusLabel }}</strong>
                            <small>
                                @if($lastPayment?->paid_at)
                                    Pembayaran terakhir {{ $lastPayment->paid_at->format('d M Y H:i') }}
                                @else
                                    Belum ada pembayaran tercatat
                                @endif
                            </small>
                        </div>
                    </div>
                    @if(filled($order->notes))
                        <div class="note" style="margin-top:18px;">
                            <strong>Catatan order:</strong> {{ $order->notes }}
                        </div>
                    @endif
                </article>

                <article class="card section">
                    <div class="section-head">
                        <div>
                            <p class="section-kicker">Layanan</p>
                            <h2>Item Pesanan</h2>
                            <p class="section-copy">Daftar layanan yang sedang atau sudah dikerjakan untuk order ini.</p>
                        </div>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Layanan</th>
                                    <th>Unit</th>
                                    <th>Qty</th>
                                    <th>Berat</th>
                                    <th>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($order->items as $item)
                                    <tr>
                                        <td><span class="service-name">{{ $item->service_name_snapshot }}</span></td>
                                        <td><span class="unit-pill">{{ $item->unit_type_snapshot }}</span></td>
                                        <td>{{ number_format((float) ($item->qty ?? 0), 2) }}</td>
                                        <td>{{ $item->weight_kg !== null ? number_format((float) $item->weight_kg, 2).' kg' : '-' }}</td>
                                        <td>Rp{{ number_format((int) $item->subtotal_amount) }}</td>
                                    </tr>
                                @empty
                                    <tr>
                                        <td colspan="5">Belum ada item layanan tercatat.</td>
                                    </tr>
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                    <div class="total-row">
                        <span>Subtotal layanan Rp{{ number_format($itemSubtotal) }} · Biaya antar Rp{{ number_format((int) $order->shipping_fee_amount) }} · Diskon Rp{{ number_format((int) $order->discount_amount) }}</span>
                        <strong>Rp{{ number_format((int) $order->total_amount) }}</strong>
                    </div>
                </article>
            </div>

            <div class="stack">
                <article class="card section">
                    <div class="section-head">
                        <div>
                            <p class="section-kicker">Logistik</p>
                            <h2>Jemput & Antar</h2>
                            <p class="section-copy">Dipakai untuk order pickup-delivery. Jika kosong, order diproses langsung di outlet.</p>
                        </div>
                    </div>
                    <div class="address-grid">
                        <div class="address-card">
                            <span class="label">Alamat Jemput</span>
                            <strong>{{ data_get($pickup, 'address_short') ?: data_get($pickup, 'address') ?: '-' }}</strong>
                            <p>{{ data_get($pickup, 'slot') ?: data_get($pickup, 'schedule_slot') ?: data_get($pickup, 'scheduled_at') ?: '-' }}</p>
                        </div>
                        <div class="address-card">
                            <span class="label">Alamat Antar</span>
                            <strong>{{ data_get($delivery, 'address_short') ?: data_get($delivery, 'address') ?: '-' }}</strong>
                            <p>{{ data_get($delivery, 'slot') ?: data_get($delivery, 'schedule_slot') ?: data_get($delivery, 'scheduled_at') ?: '-' }}</p>
                        </div>
                    </div>
                    <p class="section-copy" style="margin-top:14px;">Jadwal bisa menyesuaikan kondisi operasional outlet dan konfirmasi kurir.</p>
                </article>

                <article class="card section">
                    <div class="section-head" style="margin-bottom:0;">
                        <div>
                            <p class="section-kicker">Bantuan</p>
                            <h2>Butuh Konfirmasi Tambahan?</h2>
                            <p class="section-copy">Gunakan referensi order ini saat menghubungi outlet agar tim bisa membantu lebih cepat.</p>
                        </div>
                    </div>
                    <div class="cta-stack">
                        <div class="cta-box">
                            <h3>Referensi Order</h3>
                            <p class="section-copy">{{ $invoiceLabel }} · {{ $order->order_code }}</p>
                            <div class="link-box">{{ $trackingUrl }}</div>
                        </div>
                        <div class="cta-box">
                            <h3>Outlet Penanganan</h3>
                            <p class="section-copy">{{ $order->outlet?->name ?: '-' }} ({{ $order->outlet?->code ?: '-' }})</p>
                            <p class="section-copy">{{ $order->outlet?->address ?: 'Alamat outlet belum dicatat.' }}</p>
                        </div>
                    </div>
                </article>
            </div>
        </section>
    </main>

    <script>
        (() => {
            const button = document.getElementById('copyTrackingLink');
            const trackingUrl = @json($trackingUrl);
            if (!button || !trackingUrl) return;
            button.addEventListener('click', async () => {
                const original = button.textContent;
                try {
                    await navigator.clipboard.writeText(trackingUrl);
                    button.textContent = 'Link Tersalin';
                } catch {
                    button.textContent = 'Salin Gagal';
                }
                setTimeout(() => { button.textContent = original; }, 1800);
            });
        })();
    </script>
</body>
</html>
