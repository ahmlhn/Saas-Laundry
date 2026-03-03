<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }} {{ $invoiceLabel }}</title>
    @include('partials.vite-assets')
    <style>
        :root {
            color-scheme: light;
        }

        body {
            margin: 0;
            background:
                radial-gradient(circle at top left, rgba(14, 165, 168, 0.16), transparent 28%),
                radial-gradient(circle at right bottom, rgba(37, 99, 235, 0.14), transparent 32%),
                #eef4fb;
            color: #0f172a;
            font-family: "Manrope", "Segoe UI", sans-serif;
            line-height: 1.5;
        }

        .track-shell {
            width: min(1040px, calc(100vw - 28px));
            margin: 0 auto;
            padding: 28px 0 40px;
        }

        .track-hero {
            display: grid;
            grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr);
            gap: 18px;
            margin-bottom: 18px;
        }

        .track-card {
            background: rgba(255, 255, 255, 0.94);
            border: 1px solid rgba(191, 203, 220, 0.84);
            border-radius: 26px;
            box-shadow: 0 22px 50px rgba(15, 23, 42, 0.08);
            backdrop-filter: blur(10px);
        }

        .track-card-main {
            padding: 28px;
        }

        .track-kicker {
            margin: 0 0 8px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-size: 12px;
            font-weight: 700;
            color: #0f766e;
        }

        .track-title {
            margin: 0;
            font-size: clamp(28px, 5vw, 38px);
            line-height: 1.05;
            letter-spacing: -0.04em;
        }

        .track-lead {
            margin: 10px 0 0;
            color: #475467;
            max-width: 52ch;
        }

        .track-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 16px;
        }

        .track-badge {
            display: inline-flex;
            align-items: center;
            padding: 7px 11px;
            border-radius: 999px;
            border: 1px solid #d8e4f0;
            background: #f8fbff;
            font-size: 12px;
            font-weight: 700;
            color: #334155;
        }

        .track-side {
            padding: 22px;
            display: grid;
            gap: 14px;
            align-content: start;
            background: linear-gradient(165deg, rgba(8, 20, 40, 0.96), rgba(16, 42, 68, 0.96));
            color: #e2e8f0;
        }

        .track-side h2,
        .track-section h2 {
            margin: 0;
            font-size: 15px;
            letter-spacing: -0.02em;
        }

        .track-side p {
            margin: 6px 0 0;
            color: rgba(226, 232, 240, 0.86);
            font-size: 14px;
        }

        .track-meta-block {
            border: 1px solid rgba(191, 219, 254, 0.16);
            border-radius: 18px;
            padding: 14px;
            background: rgba(148, 163, 184, 0.08);
        }

        .track-meta-block strong {
            display: block;
            margin-top: 5px;
            font-size: 18px;
            color: #ffffff;
        }

        .track-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px;
        }

        .track-section {
            padding: 22px;
        }

        .track-detail-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-top: 16px;
        }

        .track-detail {
            border: 1px solid #e3e8f0;
            border-radius: 18px;
            padding: 14px;
            background: #fbfdff;
        }

        .track-detail span {
            display: block;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #64748b;
        }

        .track-detail strong {
            display: block;
            margin-top: 6px;
            font-size: 17px;
            color: #0f172a;
        }

        .track-detail small {
            display: block;
            margin-top: 4px;
            color: #475467;
            font-size: 13px;
        }

        .track-timeline {
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            gap: 10px;
            margin-top: 18px;
        }

        .track-step {
            position: relative;
            padding: 14px 12px 12px;
            border-radius: 18px;
            border: 1px solid #dde5ef;
            background: #f8fbff;
            text-align: center;
        }

        .track-step.is-active {
            border-color: rgba(14, 165, 168, 0.45);
            background: rgba(14, 165, 168, 0.1);
            box-shadow: inset 0 0 0 1px rgba(14, 165, 168, 0.08);
        }

        .track-step.is-done {
            border-color: rgba(8, 145, 120, 0.26);
            background: rgba(16, 185, 129, 0.08);
        }

        .track-step-index {
            width: 28px;
            height: 28px;
            margin: 0 auto 10px;
            border-radius: 999px;
            display: grid;
            place-items: center;
            background: #dce8f6;
            color: #0f172a;
            font-weight: 800;
            font-size: 13px;
        }

        .track-step.is-active .track-step-index,
        .track-step.is-done .track-step-index {
            background: #0f766e;
            color: #ffffff;
        }

        .track-step strong {
            display: block;
            font-size: 13px;
        }

        .track-step p {
            margin: 4px 0 0;
            color: #64748b;
            font-size: 12px;
        }

        .track-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
        }

        .track-table th,
        .track-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e3e8f0;
            text-align: left;
            vertical-align: top;
            font-size: 14px;
        }

        .track-table th {
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-size: 11px;
            color: #64748b;
            background: #f8fbff;
        }

        .track-note {
            margin-top: 16px;
            padding: 14px 16px;
            border-radius: 18px;
            background: #fff8eb;
            border: 1px solid #f6d39c;
            color: #7a2e0e;
            font-size: 14px;
        }

        .track-footer {
            margin-top: 16px;
            color: #64748b;
            font-size: 13px;
        }

        @media (max-width: 900px) {
            .track-hero,
            .track-grid,
            .track-detail-grid,
            .track-timeline {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    @php
        $pickup = $order->pickup ?? [];
        $delivery = $order->delivery ?? [];
        $lastPayment = $order->payments->sortByDesc('paid_at')->first();
    @endphp

    <main class="track-shell">
        <section class="track-hero">
            <article class="track-card track-card-main">
                <p class="track-kicker">Pelacakan Pesanan</p>
                <h1 class="track-title">{{ $invoiceLabel }}</h1>
                <p class="track-lead">Halo {{ $order->customer?->name ?: 'Pelanggan' }}, halaman ini menampilkan status terbaru pesanan laundry Anda di {{ $order->tenant?->name ?: config('app.name', 'Cuci') }}.</p>

                <div class="track-badges">
                    <span class="status-badge {{ $statusClass($order->laundry_status) }}">Status Laundry: {{ $statusLabel($order->laundry_status) }}</span>
                    <span class="status-badge {{ $order->courier_status ? $statusClass($order->courier_status) : 'status-neutral' }}">Status Kurir: {{ $order->courier_status ? $statusLabel($order->courier_status) : '-' }}</span>
                    <span class="track-badge">{{ $paymentStatusLabel }}</span>
                </div>

                <div class="track-timeline">
                    @foreach($statusMap as $index => $step)
                        @php
                            $stepClass = $index < $currentStep ? 'is-done' : ($index === $currentStep ? 'is-active' : '');
                        @endphp
                        <div class="track-step {{ $stepClass }}">
                            <div class="track-step-index">{{ $index + 1 }}</div>
                            <strong>{{ $step['label'] }}</strong>
                            <p>{{ $index < $currentStep ? 'Terlampaui' : ($index === $currentStep ? 'Posisi saat ini' : 'Menunggu proses') }}</p>
                        </div>
                    @endforeach
                </div>
            </article>

            <aside class="track-card track-side">
                <div class="track-meta-block">
                    <h2>Total Tagihan</h2>
                    <strong>Rp{{ number_format((int) $order->total_amount) }}</strong>
                    <p>Dibayar Rp{{ number_format((int) $order->paid_amount) }} · Sisa Rp{{ number_format((int) $order->due_amount) }}</p>
                </div>

                <div class="track-meta-block">
                    <h2>Outlet</h2>
                    <strong>{{ $order->outlet?->name ?: '-' }}</strong>
                    <p>{{ $order->outlet?->code ?: '-' }} · {{ $order->outlet?->address ?: 'Alamat outlet belum dicatat.' }}</p>
                </div>

                <div class="track-meta-block">
                    <h2>Link Tracking</h2>
                    <strong style="font-size: 14px; line-height: 1.45; word-break: break-all;">{{ $trackingUrl }}</strong>
                    <p>Simpan tautan ini untuk memantau progres pesanan Anda.</p>
                </div>
            </aside>
        </section>

        <section class="track-grid">
            <article class="track-card track-section">
                <h2>Ringkasan Pesanan</h2>
                <div class="track-detail-grid">
                    <div class="track-detail">
                        <span>Pelanggan</span>
                        <strong>{{ $order->customer?->name ?: '-' }}</strong>
                        <small>{{ $order->customer?->phone_normalized ?: '-' }}</small>
                    </div>
                    <div class="track-detail">
                        <span>Dibuat</span>
                        <strong>{{ $order->created_at?->format('d M Y H:i') ?: '-' }}</strong>
                        <small>Terakhir diperbarui {{ $order->updated_at?->format('d M Y H:i') ?: '-' }}</small>
                    </div>
                    <div class="track-detail">
                        <span>Tipe Layanan</span>
                        <strong>{{ $order->is_pickup_delivery ? 'Pickup & Delivery' : 'Drop Off Outlet' }}</strong>
                        <small>Kurir {{ $order->courier?->name ?: '-' }}</small>
                    </div>
                    <div class="track-detail">
                        <span>Pembayaran</span>
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
                    <div class="track-note">
                        <strong>Catatan order:</strong> {{ $order->notes }}
                    </div>
                @endif
            </article>

            <article class="track-card track-section">
                <h2>Jemput & Antar</h2>
                <div class="track-detail-grid">
                    <div class="track-detail">
                        <span>Alamat Jemput</span>
                        <strong>{{ data_get($pickup, 'address_short') ?: data_get($pickup, 'address') ?: '-' }}</strong>
                        <small>{{ data_get($pickup, 'slot') ?: data_get($pickup, 'schedule_slot') ?: data_get($pickup, 'scheduled_at') ?: '-' }}</small>
                    </div>
                    <div class="track-detail">
                        <span>Alamat Antar</span>
                        <strong>{{ data_get($delivery, 'address_short') ?: data_get($delivery, 'address') ?: '-' }}</strong>
                        <small>{{ data_get($delivery, 'slot') ?: data_get($delivery, 'schedule_slot') ?: data_get($delivery, 'scheduled_at') ?: '-' }}</small>
                    </div>
                </div>
                <p class="track-footer">Jika order Anda tidak memakai pickup-delivery, alamat di atas bisa kosong.</p>
            </article>
        </section>

        <section class="track-card track-section" style="margin-top: 18px;">
            <h2>Item Layanan</h2>
            <table class="track-table">
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
                            <td>{{ $item->service_name_snapshot }}</td>
                            <td>{{ $item->unit_type_snapshot }}</td>
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
            <p class="track-footer">Halaman ini menampilkan status terbaru yang tercatat di sistem. Silakan hubungi outlet bila ada detail yang perlu dikonfirmasi.</p>
        </section>
    </main>
</body>
</html>
