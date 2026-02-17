<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Receipt {{ $orderRow->invoice_no ?: $orderRow->order_code }}</title>
    <style>
        :root {
            color-scheme: light;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            background: #f4f6fa;
            color: #0f172a;
            line-height: 1.45;
        }

        .toolbar {
            width: min(880px, 94vw);
            margin: 20px auto 10px;
            display: flex;
            justify-content: space-between;
            gap: 10px;
        }

        .toolbar-actions {
            display: inline-flex;
            gap: 8px;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 9px 12px;
            border-radius: 10px;
            border: 1px solid #cdd5df;
            background: #ffffff;
            color: #0f172a;
            text-decoration: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
        }

        .btn-primary {
            background: #0ea5a8;
            border-color: #0ea5a8;
            color: #ffffff;
        }

        .receipt {
            width: min(880px, 94vw);
            margin: 0 auto 24px;
            background: #ffffff;
            border: 1px solid #dbe3ee;
            border-radius: 14px;
            padding: 18px;
        }

        .head {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            border-bottom: 1px dashed #d7deea;
            padding-bottom: 12px;
            margin-bottom: 12px;
        }

        h1 {
            margin: 0;
            font-size: 20px;
        }

        .muted {
            margin: 3px 0 0;
            color: #475467;
            font-size: 13px;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 12px;
        }

        .summary-box {
            border: 1px solid #e3e8f0;
            border-radius: 10px;
            padding: 10px;
            background: #fbfdff;
        }

        .summary-box strong {
            display: block;
            margin-top: 4px;
            font-size: 18px;
        }

        .section {
            margin-top: 14px;
        }

        .section h2 {
            margin: 0 0 8px;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #344054;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        th,
        td {
            border-bottom: 1px solid #e3e8f0;
            padding: 8px;
            text-align: left;
            vertical-align: top;
        }

        th {
            background: #f7f9fc;
            color: #475467;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .totals {
            margin-top: 12px;
            border: 1px solid #e3e8f0;
            border-radius: 10px;
            overflow: hidden;
        }

        .totals-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            padding: 9px 10px;
            font-size: 13px;
            border-bottom: 1px solid #e3e8f0;
        }

        .totals-row:last-child {
            border-bottom: 0;
        }

        .totals-row.is-total {
            background: #f7fbff;
            font-weight: 700;
        }

        .totals-row.is-due {
            background: #fff8eb;
            font-weight: 700;
        }

        .foot {
            margin-top: 14px;
            font-size: 12px;
            color: #475467;
        }

        @media (max-width: 760px) {
            .head,
            .summary-grid {
                grid-template-columns: 1fr;
            }
        }

        @media print {
            body {
                background: #ffffff;
            }

            .toolbar {
                display: none;
            }

            .receipt {
                width: 100%;
                margin: 0;
                border: 0;
                border-radius: 0;
                padding: 0;
            }

            @page {
                margin: 12mm;
            }
        }
    </style>
</head>
<body>
    <div class="toolbar">
        <a href="{{ route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $orderRow->id]) }}" class="btn">Kembali ke Detail</a>
        <div class="toolbar-actions">
            <button type="button" class="btn btn-primary" onclick="window.print()">Cetak</button>
        </div>
    </div>

    <main class="receipt">
        <section class="head">
            <div>
                <h1>Cetak Ringkas Transaksi</h1>
                <p class="muted">{{ $tenant->name }}</p>
                <p class="muted">{{ $orderRow->outlet?->name }} ({{ $orderRow->outlet?->code }})</p>
                <p class="muted">{{ $orderRow->outlet?->address ?: '-' }}</p>
            </div>
            <div>
                <p class="muted"><strong>Referensi:</strong> {{ $orderRow->invoice_no ?: $orderRow->order_code }}</p>
                <p class="muted"><strong>Kode Order:</strong> {{ $orderRow->order_code }}</p>
                <p class="muted"><strong>Tanggal:</strong> {{ $orderRow->created_at?->format('d M Y H:i') }}</p>
                <p class="muted"><strong>Pelanggan:</strong> {{ $orderRow->customer?->name ?: '-' }}</p>
                <p class="muted"><strong>Telepon:</strong> {{ $orderRow->customer?->phone_normalized ?: '-' }}</p>
            </div>
        </section>

        <section class="summary-grid">
            <article class="summary-box">
                Total
                <strong>Rp{{ number_format($orderRow->total_amount) }}</strong>
            </article>
            <article class="summary-box">
                Dibayar
                <strong>Rp{{ number_format($orderRow->paid_amount) }}</strong>
            </article>
            <article class="summary-box">
                Sisa Tagihan
                <strong>Rp{{ number_format($orderRow->due_amount) }}</strong>
            </article>
        </section>

        <section class="section">
            <h2>Item Layanan</h2>
            <table>
                <thead>
                    <tr>
                        <th>Layanan</th>
                        <th>Unit</th>
                        <th>Qty</th>
                        <th>Berat</th>
                        <th>Harga Unit</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse($orderRow->items as $item)
                        <tr>
                            <td>{{ $item->service_name_snapshot }}</td>
                            <td>{{ $item->unit_type_snapshot }}</td>
                            <td>{{ is_null($item->qty) ? '-' : number_format((float) $item->qty, 2) }}</td>
                            <td>{{ is_null($item->weight_kg) ? '-' : number_format((float) $item->weight_kg, 2) }} kg</td>
                            <td>Rp{{ number_format($item->unit_price_amount) }}</td>
                            <td>Rp{{ number_format($item->subtotal_amount) }}</td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="6">Belum ada item.</td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </section>

        <section class="section">
            <h2>Pembayaran</h2>
            <table>
                <thead>
                    <tr>
                        <th>Waktu Bayar</th>
                        <th>Metode</th>
                        <th>Jumlah</th>
                        <th>Catatan</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse($orderRow->payments as $payment)
                        <tr>
                            <td>{{ $payment->paid_at?->format('d M Y H:i') }}</td>
                            <td>{{ $payment->method }}</td>
                            <td>Rp{{ number_format($payment->amount) }}</td>
                            <td>{{ $payment->notes ?: '-' }}</td>
                        </tr>
                    @empty
                        <tr>
                            <td colspan="4">Belum ada pembayaran.</td>
                        </tr>
                    @endforelse
                </tbody>
            </table>
        </section>

        <section class="totals">
            <div class="totals-row">
                <span>Subtotal Item</span>
                <strong>Rp{{ number_format($itemSubTotal) }}</strong>
            </div>
            <div class="totals-row">
                <span>Biaya Antar/Jemput</span>
                <strong>Rp{{ number_format($orderRow->shipping_fee_amount) }}</strong>
            </div>
            <div class="totals-row">
                <span>Diskon</span>
                <strong>Rp{{ number_format($orderRow->discount_amount) }}</strong>
            </div>
            <div class="totals-row is-total">
                <span>Total Transaksi</span>
                <strong>Rp{{ number_format($orderRow->total_amount) }}</strong>
            </div>
            <div class="totals-row">
                <span>Total Dibayar</span>
                <strong>Rp{{ number_format($orderRow->paid_amount) }}</strong>
            </div>
            <div class="totals-row is-due">
                <span>Sisa Tagihan</span>
                <strong>Rp{{ number_format($orderRow->due_amount) }}</strong>
            </div>
        </section>

        <p class="foot">
            Dicetak {{ now()->format('d M Y H:i') }} · {{ $tenant->name }} · {{ $orderRow->outlet?->timezone ?: 'Asia/Jakarta' }}
        </p>
    </main>
</body>
</html>
