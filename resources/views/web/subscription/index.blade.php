@extends('web.layouts.app', ['title' => 'Langganan Tenant'])

@php
    $activeCycle = $tenant->currentSubscriptionCycle;
@endphp

@section('content')
<div class="panel-section">
    <div class="section-head">
        <h3>Langganan Tenant</h3>
        <span class="status-badge status-info">{{ strtoupper((string) ($tenant->subscription_state ?? 'active')) }}</span>
    </div>
    <p class="muted-line">
        Write access mode:
        <strong>{{ strtoupper((string) ($tenant->write_access_mode ?? 'full')) }}</strong>
        | Kuota order:
        <strong>{{ number_format((int) ($quota['orders_used'] ?? 0)) }} / {{ is_null($quota['orders_limit'] ?? null) ? 'Tak terbatas' : number_format((int) $quota['orders_limit']) }}</strong>
    </p>
</div>

<div class="dashboard-grid-2">
    <section class="panel-section">
        <div class="section-head">
            <h3>Siklus Aktif</h3>
            <span class="status-badge {{ $activeCycle ? 'status-success' : 'status-neutral' }}">{{ $activeCycle ? 'Aktif' : 'Belum Ada' }}</span>
        </div>
        @if($activeCycle)
            <div class="table-wrap">
                <table>
                    <tbody>
                    <tr>
                        <th>Plan</th>
                        <td>{{ $activeCycle->plan?->name ?? '-' }} ({{ strtoupper((string) ($activeCycle->plan?->key ?? '-')) }})</td>
                    </tr>
                    <tr>
                        <th>Periode</th>
                        <td>{{ $activeCycle->cycle_start_at?->format('d M Y H:i') }} - {{ $activeCycle->cycle_end_at?->format('d M Y H:i') }}</td>
                    </tr>
                    <tr>
                        <th>Auto Renew</th>
                        <td>{{ $activeCycle->auto_renew ? 'ON' : 'OFF' }}</td>
                    </tr>
                    <tr>
                        <th>Limit Snapshot</th>
                        <td>{{ is_null($activeCycle->orders_limit_snapshot) ? 'Tak terbatas' : number_format((int) $activeCycle->orders_limit_snapshot) }}</td>
                    </tr>
                    </tbody>
                </table>
            </div>
        @else
            <p class="muted-line">Belum ada subscription cycle aktif.</p>
        @endif
    </section>

    <section class="panel-section">
        <div class="section-head">
            <h3>Request Perubahan Paket</h3>
            <span class="status-badge {{ $pendingChange ? 'status-warning' : 'status-neutral' }}">{{ $pendingChange ? 'Pending' : 'Kosong' }}</span>
        </div>

        @if($pendingChange)
            <p class="muted-line">
                Target: <strong>{{ $pendingChange->targetPlan?->name ?? '-' }}</strong>
                | Berlaku: <strong>{{ $pendingChange->effective_at?->format('d M Y H:i') ?? '-' }}</strong>
            </p>
            <form method="POST" action="{{ route('tenant.subscription.change-request.cancel', ['tenant' => $tenant->id, 'changeRequestId' => $pendingChange->id]) }}">
                @csrf
                @method('DELETE')
                <button class="btn btn-muted" type="submit">Batalkan Request</button>
            </form>
        @else
            <form method="POST" action="{{ route('tenant.subscription.change-request.store', ['tenant' => $tenant->id]) }}" class="filters-grid">
                @csrf
                <div>
                    <label for="target_plan_id">Paket Tujuan</label>
                    <select id="target_plan_id" name="target_plan_id" required>
                        <option value="">Pilih paket</option>
                        @foreach($plans as $plan)
                            <option value="{{ $plan->id }}" @disabled($tenant->current_plan_id === $plan->id)>
                                {{ $plan->name }} ({{ strtoupper((string) $plan->key) }}) - Rp{{ number_format((int) ($plan->monthly_price_amount ?? 0)) }}
                            </option>
                        @endforeach
                    </select>
                </div>
                <div>
                    <label for="note">Catatan</label>
                    <input id="note" type="text" name="note" maxlength="500" placeholder="Opsional">
                </div>
                <div class="filter-actions">
                    <button class="btn btn-primary" type="submit">Ajukan Perubahan Paket</button>
                </div>
            </form>
        @endif
    </section>
</div>

<section class="panel-section">
    <div class="section-head">
        <h3>Invoice Langganan</h3>
        <span class="status-badge status-info">{{ number_format($invoices->count()) }} invoice</span>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Invoice</th>
                <th>Status</th>
                <th>Payment Method</th>
                <th>Nominal</th>
                <th>Jatuh Tempo</th>
                <th>Pembayaran</th>
            </tr>
            </thead>
            <tbody>
            @forelse($invoices as $invoice)
                @php
                    $latestIntent = $invoice->paymentIntents->first();
                    $latestEvent = $invoice->paymentEvents->first();
                @endphp
                <tr>
                    <td>
                        <p class="row-title">{{ $invoice->invoice_no }}</p>
                        <p class="row-subtitle">Terbit {{ $invoice->issued_at?->format('d M Y H:i') ?? '-' }}</p>
                    </td>
                    <td>{{ strtoupper((string) $invoice->status) }}</td>
                    <td>{{ strtoupper((string) $invoice->payment_method) }}</td>
                    <td>Rp{{ number_format((int) $invoice->amount_total) }}</td>
                    <td>{{ $invoice->due_at?->format('d M Y H:i') ?? '-' }}</td>
                    <td>
                        @if($invoice->payment_method === 'bri_qris')
                            <p class="row-subtitle">Gateway: {{ strtoupper((string) ($invoice->gateway_status ?? 'WAITING')) }}</p>
                            <p class="row-subtitle">Reference: {{ $invoice->gateway_reference ?? '-' }}</p>
                            @if($latestEvent)
                                <p class="row-subtitle">
                                    Event: {{ strtoupper((string) $latestEvent->process_status) }}
                                    | {{ $latestEvent->received_at?->format('d M Y H:i') ?? '-' }}
                                </p>
                            @endif
                            @if($latestIntent)
                                <p class="row-subtitle">QRIS expire: {{ $latestIntent->expires_at?->format('d M Y H:i') ?? '-' }}</p>
                            @endif
                            <form method="POST" action="{{ route('tenant.subscription.invoices.qris-intent', ['tenant' => $tenant->id, 'invoiceId' => $invoice->id]) }}" style="margin-top:8px;">
                                @csrf
                                <button class="btn btn-muted" type="submit">Refresh QRIS Intent</button>
                            </form>
                            @if($invoice->qris_payload)
                                <p class="row-subtitle" style="margin-top:8px;word-break:break-all;">Payload: {{ $invoice->qris_payload }}</p>
                            @endif
                        @else
                            <p class="row-subtitle">{{ number_format((int) $invoice->proofs_count) }} file</p>
                            <form method="POST" action="{{ route('tenant.subscription.invoices.proof.upload', ['tenant' => $tenant->id, 'invoiceId' => $invoice->id]) }}" enctype="multipart/form-data" class="filters-grid" style="margin-top:8px;">
                                @csrf
                                <div>
                                    <input type="file" name="proof_file" accept=".jpg,.jpeg,.png,.pdf" required>
                                </div>
                                <div>
                                    <input type="text" name="note" maxlength="500" placeholder="Catatan bukti (opsional)">
                                </div>
                                <div class="filter-actions">
                                    <button class="btn btn-muted" type="submit">Upload Bukti</button>
                                </div>
                            </form>
                        @endif
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Belum ada invoice langganan.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
@endsection
