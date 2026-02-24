@extends('web.platform.layouts.app', ['title' => 'Detail Tenant Subscription'])

@section('content')
<section class="panel-section">
    <div class="section-head">
        <h3>{{ $tenant->name }}</h3>
        <span class="status-badge status-info">{{ strtoupper((string) ($tenant->subscription_state ?? 'active')) }}</span>
    </div>
    <div class="table-wrap">
        <table>
            <tbody>
            <tr>
                <th>Tenant ID</th>
                <td>{{ $tenant->id }}</td>
            </tr>
            <tr>
                <th>Plan Saat Ini</th>
                <td>{{ $tenant->currentPlan?->name ?? '-' }} ({{ strtoupper((string) ($tenant->currentPlan?->key ?? '-')) }})</td>
            </tr>
            <tr>
                <th>Write Mode</th>
                <td>{{ strtoupper((string) ($tenant->write_access_mode ?? 'full')) }}</td>
            </tr>
            <tr>
                <th>Cycle</th>
                <td>
                    @if($tenant->currentSubscriptionCycle)
                        {{ $tenant->currentSubscriptionCycle->cycle_start_at?->format('d M Y H:i') }} - {{ $tenant->currentSubscriptionCycle->cycle_end_at?->format('d M Y H:i') }}
                    @else
                        Belum ada cycle
                    @endif
                </td>
            </tr>
            </tbody>
        </table>
    </div>
    <div class="filter-actions" style="margin-top: 12px;">
        <form method="POST" action="{{ route('platform.subscriptions.tenants.suspend', ['tenant' => $tenant->id]) }}">
            @csrf
            <button class="btn btn-muted" type="submit">Suspend Tenant</button>
        </form>
        <form method="POST" action="{{ route('platform.subscriptions.tenants.activate', ['tenant' => $tenant->id]) }}">
            @csrf
            <button class="btn btn-primary" type="submit">Activate Tenant</button>
        </form>
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Invoice Langganan</h3>
        <span class="status-badge status-info">{{ number_format($invoices->total()) }} invoice</span>
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
                <th>Gateway</th>
                <th>Bukti</th>
                <th>Aksi Verifikasi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($invoices as $invoice)
                @php
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
                        <p class="row-title">{{ strtoupper((string) ($invoice->gateway_status ?? '-')) }}</p>
                        <p class="row-subtitle">Ref: {{ $invoice->gateway_reference ?? '-' }}</p>
                        @if($latestEvent)
                            <p class="row-subtitle">
                                Event: {{ strtoupper((string) $latestEvent->process_status) }}
                                | {{ $latestEvent->received_at?->format('d M Y H:i') ?? '-' }}
                            </p>
                        @endif
                    </td>
                    <td>
                        @forelse($invoice->proofs as $proof)
                            <p class="row-title">{{ $proof->file_name }}</p>
                            <p class="row-subtitle">{{ strtoupper((string) $proof->status) }} | {{ $proof->created_at?->format('d M Y H:i') }}</p>
                        @empty
                            <p class="row-subtitle">Belum ada bukti</p>
                        @endforelse
                    </td>
                    <td>
                        @if($invoice->payment_method === 'bri_qris')
                            <p class="row-subtitle">Auto-verify via webhook</p>
                        @else
                            <form method="POST" action="{{ route('platform.subscriptions.invoices.verify', ['invoiceId' => $invoice->id]) }}" class="filters-grid">
                                @csrf
                                <div>
                                    <select name="decision" required>
                                        <option value="approve">Approve</option>
                                        <option value="reject">Reject</option>
                                    </select>
                                </div>
                                <div>
                                    <input type="text" name="note" maxlength="500" placeholder="Catatan verifikasi">
                                </div>
                                <div class="filter-actions">
                                    <button class="btn btn-muted" type="submit">Proses</button>
                                </div>
                            </form>
                        @endif
                    </td>
                </tr>
            @empty
                <tr>
                    <td colspan="8">Belum ada invoice langganan.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
    <div style="margin-top:12px;">
        {{ $invoices->links() }}
    </div>
</section>

<section class="panel-section">
    <div class="section-head">
        <h3>Gateway Payment Events</h3>
        <span class="status-badge status-info">{{ number_format($paymentEvents->count()) }} event</span>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
            <tr>
                <th>Waktu</th>
                <th>Gateway Event</th>
                <th>Status</th>
                <th>Invoice</th>
                <th>Nominal</th>
                <th>Reason</th>
            </tr>
            </thead>
            <tbody>
            @forelse($paymentEvents as $event)
                <tr>
                    <td>{{ $event->received_at?->format('d M Y H:i') ?? '-' }}</td>
                    <td>
                        <p class="row-title">{{ $event->gateway_event_id }}</p>
                        <p class="row-subtitle">{{ strtoupper((string) $event->event_type) }}</p>
                    </td>
                    <td>{{ strtoupper((string) $event->process_status) }}</td>
                    <td>{{ $event->invoice?->invoice_no ?? ($event->invoice_id ?? '-') }}</td>
                    <td>{{ $event->amount_total !== null ? 'Rp'.number_format((int) $event->amount_total) : '-' }}</td>
                    <td>{{ $event->rejection_reason ?? '-' }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="6">Belum ada event pembayaran gateway.</td>
                </tr>
            @endforelse
            </tbody>
        </table>
    </div>
</section>
@endsection
