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
                <th>Nominal</th>
                <th>Jatuh Tempo</th>
                <th>Bukti</th>
                <th>Aksi Verifikasi</th>
            </tr>
            </thead>
            <tbody>
            @forelse($invoices as $invoice)
                <tr>
                    <td>
                        <p class="row-title">{{ $invoice->invoice_no }}</p>
                        <p class="row-subtitle">Terbit {{ $invoice->issued_at?->format('d M Y H:i') ?? '-' }}</p>
                    </td>
                    <td>{{ strtoupper((string) $invoice->status) }}</td>
                    <td>Rp{{ number_format((int) $invoice->amount_total) }}</td>
                    <td>{{ $invoice->due_at?->format('d M Y H:i') ?? '-' }}</td>
                    <td>
                        @forelse($invoice->proofs as $proof)
                            <p class="row-title">{{ $proof->file_name }}</p>
                            <p class="row-subtitle">{{ strtoupper((string) $proof->status) }} | {{ $proof->created_at?->format('d M Y H:i') }}</p>
                        @empty
                            <p class="row-subtitle">Belum ada bukti</p>
                        @endforelse
                    </td>
                    <td>
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
    <div style="margin-top:12px;">
        {{ $invoices->links() }}
    </div>
</section>
@endsection
