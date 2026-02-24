<?php

namespace App\Http\Controllers\Web\Platform;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Controller;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentEvent;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class SubscriptionController extends Controller
{
    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request): View
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'in:active,past_due,suspended'],
        ]);

        $query = Tenant::query()
            ->with([
                'currentPlan:id,key,name,monthly_price_amount,currency',
                'currentSubscriptionCycle:id,tenant_id,status,cycle_start_at,cycle_end_at,auto_renew',
            ])
            ->orderBy('name');

        if (! empty($validated['state'])) {
            $query->where('subscription_state', $validated['state']);
        }

        if (! empty($validated['q'])) {
            $keyword = trim((string) $validated['q']);
            $query->where(function ($q) use ($keyword): void {
                $q->where('name', 'like', '%'.$keyword.'%')
                    ->orWhere('id', 'like', '%'.$keyword.'%');
            });
        }

        $tenants = $query->paginate(30)->withQueryString();

        return view('web.platform.subscriptions.index', [
            'user' => $user,
            'tenants' => $tenants,
            'filters' => $validated,
        ]);
    }

    public function show(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();

        $tenant->load([
            'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
            'currentSubscriptionCycle:id,tenant_id,status,orders_limit_snapshot,cycle_start_at,cycle_end_at,auto_renew,activated_at',
            'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
        ]);

        $invoices = SubscriptionInvoice::query()
            ->with([
                'proofs' => fn ($query) => $query->latest('created_at'),
                'paymentEvents' => fn ($query) => $query->latest('received_at'),
            ])
            ->where('tenant_id', $tenant->id)
            ->latest('issued_at')
            ->paginate(20)
            ->withQueryString();

        $paymentEvents = SubscriptionPaymentEvent::query()
            ->with('invoice:id,invoice_no')
            ->where('tenant_id', $tenant->id)
            ->latest('received_at')
            ->limit(30)
            ->get();

        return view('web.platform.subscriptions.show', [
            'user' => $user,
            'tenant' => $tenant,
            'invoices' => $invoices,
            'paymentEvents' => $paymentEvents,
        ]);
    }

    public function verifyInvoice(Request $request, string $invoiceId): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $invoice = SubscriptionInvoice::query()
            ->with(['proofs' => fn ($query) => $query->latest('created_at')])
            ->whereKey($invoiceId)
            ->first();

        if (! $invoice) {
            throw ValidationException::withMessages([
                'platform' => ['Invoice langganan tidak ditemukan.'],
            ]);
        }

        if ($invoice->payment_method === 'bri_qris') {
            throw ValidationException::withMessages([
                'platform' => ['Invoice bri_qris diverifikasi otomatis oleh webhook gateway.'],
            ]);
        }

        $proof = $invoice->proofs->first();
        $decision = (string) $validated['decision'];
        $note = trim((string) ($validated['note'] ?? ''));

        if ($decision === 'approve') {
            $invoice->forceFill([
                'status' => 'paid',
                'paid_verified_at' => now(),
                'verified_by' => $user->id,
                'updated_by' => $user->id,
            ])->save();

            if ($proof) {
                $proof->forceFill([
                    'status' => 'approved',
                    'reviewed_by' => $user->id,
                    'reviewed_at' => now(),
                    'review_note' => $note !== '' ? $note : 'Approved by platform operator.',
                ])->save();
            }

            Tenant::query()->whereKey($invoice->tenant_id)->update([
                'subscription_state' => 'active',
                'write_access_mode' => 'full',
            ]);
        } else {
            $invoice->forceFill([
                'status' => 'rejected',
                'updated_by' => $user->id,
            ])->save();

            if ($proof) {
                $proof->forceFill([
                    'status' => 'rejected',
                    'reviewed_by' => $user->id,
                    'reviewed_at' => now(),
                    'review_note' => $note !== '' ? $note : 'Rejected by platform operator.',
                ])->save();
            }
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_SUBSCRIPTION_INVOICE_VERIFIED,
            actor: $user,
            tenantId: $invoice->tenant_id,
            entityType: 'subscription_invoice',
            entityId: $invoice->id,
            metadata: [
                'decision' => $decision,
                'status_after' => $invoice->status,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('platform.subscriptions.show', ['tenant' => $invoice->tenant_id])
            ->with('status', 'Verifikasi invoice berhasil diproses.');
    }

    public function suspendTenant(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->hasRole('platform_owner')) {
            abort(403, 'Only platform_owner can suspend tenant.');
        }

        $tenant->forceFill([
            'subscription_state' => 'suspended',
            'write_access_mode' => 'read_only',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_TENANT_SUSPENDED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'tenant',
            entityId: $tenant->id,
            metadata: [
                'source' => 'platform_web',
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('platform.subscriptions.show', ['tenant' => $tenant->id])
            ->with('status', 'Tenant berhasil disuspend (read-only).');
    }

    public function activateTenant(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->hasRole('platform_owner')) {
            abort(403, 'Only platform_owner can activate tenant.');
        }

        $tenant->forceFill([
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_TENANT_ACTIVATED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'tenant',
            entityId: $tenant->id,
            metadata: [
                'source' => 'platform_web',
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('platform.subscriptions.show', ['tenant' => $tenant->id])
            ->with('status', 'Tenant berhasil diaktifkan kembali.');
    }
}
