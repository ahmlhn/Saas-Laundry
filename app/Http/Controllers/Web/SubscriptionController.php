<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaService;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Plan;
use App\Models\SubscriptionChangeRequest;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentProof;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

class SubscriptionController extends Controller
{
    use EnsuresWebPanelAccess;

    public function __construct(
        private readonly QuotaService $quotaService,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOwnerOnly($user);

        $tenant->load([
            'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
            'currentSubscriptionCycle:id,tenant_id,plan_id,status,orders_limit_snapshot,cycle_start_at,cycle_end_at,auto_renew,activated_at',
            'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
        ]);

        $plans = Plan::query()
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('id')
            ->get(['id', 'key', 'name', 'orders_limit', 'monthly_price_amount', 'currency']);

        $pendingChange = SubscriptionChangeRequest::query()
            ->with('targetPlan:id,key,name,orders_limit,monthly_price_amount,currency')
            ->where('tenant_id', $tenant->id)
            ->where('status', 'pending')
            ->latest('created_at')
            ->first();

        $invoices = SubscriptionInvoice::query()
            ->withCount('proofs')
            ->where('tenant_id', $tenant->id)
            ->latest('issued_at')
            ->limit(20)
            ->get();

        return view('web.subscription.index', [
            'tenant' => $tenant,
            'user' => $user,
            'quota' => $this->quotaService->snapshot($tenant->id),
            'plans' => $plans,
            'pendingChange' => $pendingChange,
            'invoices' => $invoices,
        ]);
    }

    public function storeChangeRequest(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOwnerOnly($user);

        $validated = $request->validate([
            'target_plan_id' => ['required', 'integer', 'exists:plans,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $targetPlan = Plan::query()
            ->where('id', $validated['target_plan_id'])
            ->where('is_active', true)
            ->first();

        if (! $targetPlan) {
            throw ValidationException::withMessages([
                'subscription' => ['Paket target tidak ditemukan atau tidak aktif.'],
            ]);
        }

        if ((int) $tenant->current_plan_id === (int) $targetPlan->id) {
            throw ValidationException::withMessages([
                'subscription' => ['Paket target harus berbeda dari paket saat ini.'],
            ]);
        }

        $existsPending = SubscriptionChangeRequest::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'pending')
            ->exists();

        if ($existsPending) {
            throw ValidationException::withMessages([
                'subscription' => ['Masih ada request perubahan paket yang pending.'],
            ]);
        }

        $tenant->loadMissing('currentSubscriptionCycle:id,tenant_id,cycle_end_at');

        $effectiveAt = $tenant->currentSubscriptionCycle?->cycle_end_at
            ? $tenant->currentSubscriptionCycle->cycle_end_at->copy()->addSecond()
            : now()->addDays(30)->startOfDay();

        $changeRequest = SubscriptionChangeRequest::query()->create([
            'tenant_id' => $tenant->id,
            'current_cycle_id' => $tenant->current_subscription_cycle_id,
            'target_plan_id' => $targetPlan->id,
            'effective_at' => $effectiveAt,
            'status' => 'pending',
            'requested_by' => $user->id,
            'decision_note' => trim((string) ($validated['note'] ?? '')) ?: null,
        ]);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SUBSCRIPTION_CHANGE_REQUEST_CREATED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'subscription_change_request',
            entityId: $changeRequest->id,
            metadata: [
                'target_plan_id' => $targetPlan->id,
                'target_plan_key' => $targetPlan->key,
                'effective_at' => $effectiveAt->toIso8601String(),
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.subscription.index', ['tenant' => $tenant->id])
            ->with('status', 'Request perubahan paket berhasil dibuat.');
    }

    public function cancelChangeRequest(Request $request, Tenant $tenant, string $changeRequestId): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOwnerOnly($user);

        $changeRequest = SubscriptionChangeRequest::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $changeRequestId)
            ->first();

        if (! $changeRequest || $changeRequest->status !== 'pending') {
            throw ValidationException::withMessages([
                'subscription' => ['Request perubahan paket tidak ditemukan atau tidak bisa dibatalkan.'],
            ]);
        }

        $changeRequest->forceFill([
            'status' => 'cancelled',
            'decided_by' => $user->id,
            'decision_note' => 'Cancelled by tenant owner.',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SUBSCRIPTION_CHANGE_REQUEST_CANCELLED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'subscription_change_request',
            entityId: $changeRequest->id,
            metadata: [
                'target_plan_id' => $changeRequest->target_plan_id,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.subscription.index', ['tenant' => $tenant->id])
            ->with('status', 'Request perubahan paket dibatalkan.');
    }

    public function uploadProof(Request $request, Tenant $tenant, string $invoiceId): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOwnerOnly($user);

        $validated = $request->validate([
            'proof_file' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $invoice = SubscriptionInvoice::query()
            ->where('tenant_id', $tenant->id)
            ->where('id', $invoiceId)
            ->first();

        if (! $invoice) {
            throw ValidationException::withMessages([
                'subscription' => ['Invoice langganan tidak ditemukan.'],
            ]);
        }

        /** @var UploadedFile $proofFile */
        $proofFile = $validated['proof_file'];

        $proof = DB::transaction(function () use ($user, $invoice, $proofFile, $validated): SubscriptionPaymentProof {
            $filename = sprintf(
                '%s-%s.%s',
                now()->format('YmdHis'),
                Str::random(10),
                $proofFile->getClientOriginalExtension()
            );

            $directory = sprintf('subscription-proofs/%s/%s', $invoice->tenant_id, $invoice->id);
            $storedPath = $proofFile->storeAs($directory, $filename, 'local');

            $proof = SubscriptionPaymentProof::query()->create([
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'uploaded_by' => $user->id,
                'file_path' => $storedPath,
                'file_name' => $proofFile->getClientOriginalName(),
                'mime_type' => (string) $proofFile->getClientMimeType(),
                'file_size' => (int) $proofFile->getSize(),
                'checksum_sha256' => hash_file('sha256', $proofFile->getRealPath()),
                'status' => 'submitted',
                'review_note' => trim((string) ($validated['note'] ?? '')) ?: null,
            ]);

            $invoice->forceFill([
                'status' => 'pending_verification',
                'updated_by' => $user->id,
            ])->save();

            return $proof;
        });

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SUBSCRIPTION_PAYMENT_PROOF_UPLOADED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'subscription_payment_proof',
            entityId: $proof->id,
            metadata: [
                'invoice_id' => $invoice->id,
                'file_name' => $proof->file_name,
                'mime_type' => $proof->mime_type,
                'file_size' => $proof->file_size,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.subscription.index', ['tenant' => $tenant->id])
            ->with('status', 'Bukti bayar berhasil diunggah, menunggu verifikasi platform.');
    }

    private function ensureOwnerOnly(User $user): void
    {
        if ($this->isOwner($user)) {
            return;
        }

        abort(403, 'Only owner can manage tenant subscription.');
    }
}
