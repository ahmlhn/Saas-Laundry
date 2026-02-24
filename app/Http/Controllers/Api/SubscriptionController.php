<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaService;
use App\Domain\Subscription\SubscriptionPaymentGatewayService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Models\SubscriptionChangeRequest;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentEvent;
use App\Models\SubscriptionPaymentIntent;
use App\Models\SubscriptionPaymentProof;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SubscriptionController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly QuotaService $quotaService,
        private readonly AuditTrailService $auditTrail,
        private readonly SubscriptionPaymentGatewayService $paymentGatewayService,
    ) {
    }

    public function current(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $tenant = Tenant::query()
            ->with([
                'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
                'currentSubscriptionCycle:id,tenant_id,plan_id,status,orders_limit_snapshot,cycle_start_at,cycle_end_at,auto_renew,activated_at',
                'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
            ])
            ->whereKey($user->tenant_id)
            ->first();

        if (! $tenant) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant not found.',
            ], 404);
        }

        $pendingChange = SubscriptionChangeRequest::query()
            ->with('targetPlan:id,key,name,orders_limit,monthly_price_amount,currency')
            ->where('tenant_id', $tenant->id)
            ->where('status', 'pending')
            ->latest('created_at')
            ->first();

        $nextInvoice = SubscriptionInvoice::query()
            ->where('tenant_id', $tenant->id)
            ->whereIn('status', ['issued', 'pending_verification', 'overdue'])
            ->orderBy('due_at')
            ->first();

        return response()->json([
            'data' => [
                'tenant' => [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'subscription_state' => (string) ($tenant->subscription_state ?: 'active'),
                    'write_access_mode' => (string) ($tenant->write_access_mode ?: 'full'),
                ],
                'current_cycle' => $this->serializeCycle($tenant->currentSubscriptionCycle),
                'quota' => $this->quotaService->snapshot($tenant->id),
                'pending_change_request' => $pendingChange ? $this->serializeChangeRequest($pendingChange) : null,
                'next_invoice' => $nextInvoice ? $this->serializeInvoice($nextInvoice) : null,
            ],
        ]);
    }

    public function plans(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        $currentPlanId = $user->tenant?->current_plan_id;

        $plans = Plan::query()
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('id')
            ->get(['id', 'key', 'name', 'orders_limit', 'monthly_price_amount', 'currency', 'display_order']);

        return response()->json([
            'data' => $plans->map(function (Plan $plan) use ($currentPlanId): array {
                return [
                    'id' => $plan->id,
                    'key' => $plan->key,
                    'name' => $plan->name,
                    'orders_limit' => $plan->orders_limit,
                    'monthly_price_amount' => (int) $plan->monthly_price_amount,
                    'currency' => $plan->currency,
                    'is_current' => (int) $plan->id === (int) $currentPlanId,
                ];
            })->values(),
        ]);
    }

    public function storeChangeRequest(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $validated = $request->validate([
            'target_plan_id' => ['required', 'integer', 'exists:plans,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $tenant = Tenant::query()
            ->with('currentSubscriptionCycle:id,tenant_id,cycle_end_at')
            ->whereKey($user->tenant_id)
            ->first();

        if (! $tenant) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant not found.',
            ], 404);
        }

        $targetPlan = Plan::query()
            ->where('id', $validated['target_plan_id'])
            ->where('is_active', true)
            ->first();

        if (! $targetPlan) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Target plan is invalid or inactive.',
            ], 422);
        }

        if ((int) $tenant->current_plan_id === (int) $targetPlan->id) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Target plan must be different from current plan.',
            ], 422);
        }

        $existingPending = SubscriptionChangeRequest::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'pending')
            ->exists();

        if ($existingPending) {
            return response()->json([
                'reason_code' => 'CHANGE_REQUEST_PENDING',
                'message' => 'A pending plan change request already exists.',
            ], 422);
        }

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

        $changeRequest->load('targetPlan:id,key,name,orders_limit,monthly_price_amount,currency');

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SUBSCRIPTION_CHANGE_REQUEST_CREATED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'subscription_change_request',
            entityId: $changeRequest->id,
            metadata: [
                'target_plan_id' => $targetPlan->id,
                'target_plan_key' => $targetPlan->key,
                'effective_at' => $changeRequest->effective_at?->toIso8601String(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeChangeRequest($changeRequest),
        ], 201);
    }

    public function cancelChangeRequest(Request $request, string $changeRequestId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $changeRequest = SubscriptionChangeRequest::query()
            ->with('targetPlan:id,key,name,orders_limit,monthly_price_amount,currency')
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $changeRequestId)
            ->first();

        if (! $changeRequest) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Plan change request not found.',
            ], 404);
        }

        if ($changeRequest->status !== 'pending') {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Only pending plan change request can be cancelled.',
            ], 422);
        }

        $changeRequest->forceFill([
            'status' => 'cancelled',
            'decided_by' => $user->id,
            'decision_note' => 'Cancelled by tenant owner.',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::SUBSCRIPTION_CHANGE_REQUEST_CANCELLED,
            actor: $user,
            tenantId: $user->tenant_id,
            entityType: 'subscription_change_request',
            entityId: $changeRequest->id,
            metadata: [
                'target_plan_id' => $changeRequest->target_plan_id,
                'effective_at' => $changeRequest->effective_at?->toIso8601String(),
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeChangeRequest($changeRequest->fresh(['targetPlan:id,key,name,orders_limit,monthly_price_amount,currency'])),
        ]);
    }

    public function invoices(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $limit = (int) ($validated['limit'] ?? 30);
        $invoices = SubscriptionInvoice::query()
            ->withCount('proofs')
            ->where('tenant_id', $user->tenant_id)
            ->orderByDesc('issued_at')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => $invoices->map(fn (SubscriptionInvoice $invoice): array => array_merge(
                $this->serializeInvoice($invoice),
                ['proofs_count' => (int) $invoice->proofs_count]
            ))->values(),
        ]);
    }

    public function showInvoice(Request $request, string $invoiceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $invoice = SubscriptionInvoice::query()
            ->with([
                'proofs' => fn ($query) => $query->latest('created_at'),
                'paymentIntents' => fn ($query) => $query->latest('created_at'),
                'paymentEvents' => fn ($query) => $query->latest('received_at'),
            ])
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $invoiceId)
            ->first();

        if (! $invoice) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Subscription invoice not found.',
            ], 404);
        }

        return response()->json([
            'data' => array_merge($this->serializeInvoice($invoice), [
                'proofs' => $invoice->proofs->map(fn (SubscriptionPaymentProof $proof): array => $this->serializeProof($proof))->values(),
                'latest_intent' => $invoice->paymentIntents->first()
                    ? $this->serializeIntent($invoice->paymentIntents->first())
                    : null,
                'latest_event' => $invoice->paymentEvents->first()
                    ? $this->serializeEvent($invoice->paymentEvents->first())
                    : null,
            ]),
        ]);
    }

    public function createQrisIntent(Request $request, string $invoiceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $invoice = SubscriptionInvoice::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $invoiceId)
            ->first();

        if (! $invoice) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Subscription invoice not found.',
            ], 404);
        }

        if ($invoice->payment_method !== 'bri_qris') {
            return response()->json([
                'reason_code' => 'PAYMENT_METHOD_NOT_SUPPORTED',
                'message' => 'QRIS intent is only available for bri_qris invoices.',
            ], 422);
        }

        try {
            $intent = $this->paymentGatewayService->createQrisIntent($invoice, $user);
        } catch (\Throwable $error) {
            report($error);

            return response()->json([
                'reason_code' => 'GATEWAY_REQUEST_FAILED',
                'message' => 'Failed to create QRIS payment intent.',
            ], 422);
        }

        $invoice = $invoice->fresh();

        return response()->json([
            'data' => [
                'invoice' => $this->serializeInvoice($invoice),
                'intent' => $this->serializeIntent($intent),
            ],
        ], 201);
    }

    public function paymentStatus(Request $request, string $invoiceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $invoice = SubscriptionInvoice::query()
            ->with([
                'paymentIntents' => fn ($query) => $query->latest('created_at'),
                'paymentEvents' => fn ($query) => $query->latest('received_at'),
            ])
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $invoiceId)
            ->first();

        if (! $invoice) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Subscription invoice not found.',
            ], 404);
        }

        return response()->json([
            'data' => [
                'invoice' => $this->serializeInvoice($invoice),
                'latest_intent' => $invoice->paymentIntents->first()
                    ? $this->serializeIntent($invoice->paymentIntents->first())
                    : null,
                'latest_event' => $invoice->paymentEvents->first()
                    ? $this->serializeEvent($invoice->paymentEvents->first())
                    : null,
                'events' => $invoice->paymentEvents
                    ->take(10)
                    ->map(fn (SubscriptionPaymentEvent $event): array => $this->serializeEvent($event))
                    ->values(),
            ],
        ]);
    }

    public function uploadInvoiceProof(Request $request, string $invoiceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner']);

        if (! $user->tenant_id) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Tenant scope is not available for this account.',
            ], 404);
        }

        $validated = $request->validate([
            'proof_file' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $invoice = SubscriptionInvoice::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('id', $invoiceId)
            ->first();

        if (! $invoice) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Subscription invoice not found.',
            ], 404);
        }

        if ($invoice->payment_method === 'bri_qris') {
            return response()->json([
                'reason_code' => 'LEGACY_PROOF_ONLY',
                'message' => 'Proof upload is only available for legacy bank_transfer invoices.',
            ], 422);
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
            tenantId: $user->tenant_id,
            entityType: 'subscription_payment_proof',
            entityId: $proof->id,
            metadata: [
                'invoice_id' => $invoice->id,
                'mime_type' => $proof->mime_type,
                'file_size' => $proof->file_size,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'invoice' => $this->serializeInvoice($invoice->fresh()),
                'proof' => $this->serializeProof($proof),
            ],
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeCycle(?\App\Models\SubscriptionCycle $cycle): ?array
    {
        if (! $cycle) {
            return null;
        }

        return [
            'id' => $cycle->id,
            'status' => $cycle->status,
            'plan' => $cycle->plan ? [
                'id' => $cycle->plan->id,
                'key' => $cycle->plan->key,
                'name' => $cycle->plan->name,
                'orders_limit' => $cycle->plan->orders_limit,
                'monthly_price_amount' => (int) ($cycle->plan->monthly_price_amount ?? 0),
                'currency' => $cycle->plan->currency ?? 'IDR',
            ] : null,
            'orders_limit_snapshot' => $cycle->orders_limit_snapshot,
            'cycle_start_at' => $cycle->cycle_start_at?->toIso8601String(),
            'cycle_end_at' => $cycle->cycle_end_at?->toIso8601String(),
            'auto_renew' => (bool) $cycle->auto_renew,
            'activated_at' => $cycle->activated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeChangeRequest(SubscriptionChangeRequest $request): array
    {
        return [
            'id' => $request->id,
            'tenant_id' => $request->tenant_id,
            'current_cycle_id' => $request->current_cycle_id,
            'status' => $request->status,
            'effective_at' => $request->effective_at?->toIso8601String(),
            'decision_note' => $request->decision_note,
            'target_plan' => $request->targetPlan ? [
                'id' => $request->targetPlan->id,
                'key' => $request->targetPlan->key,
                'name' => $request->targetPlan->name,
                'orders_limit' => $request->targetPlan->orders_limit,
                'monthly_price_amount' => (int) ($request->targetPlan->monthly_price_amount ?? 0),
                'currency' => $request->targetPlan->currency ?? 'IDR',
            ] : null,
            'created_at' => $request->created_at?->toIso8601String(),
            'updated_at' => $request->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeInvoice(SubscriptionInvoice $invoice): array
    {
        return [
            'id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
            'cycle_id' => $invoice->cycle_id,
            'invoice_no' => $invoice->invoice_no,
            'amount_total' => (int) $invoice->amount_total,
            'currency' => $invoice->currency,
            'tax_included' => (bool) $invoice->tax_included,
            'payment_method' => $invoice->payment_method,
            'status' => $invoice->status,
            'gateway_provider' => $invoice->gateway_provider,
            'gateway_reference' => $invoice->gateway_reference,
            'gateway_status' => $invoice->gateway_status,
            'gateway_paid_amount' => $invoice->gateway_paid_amount !== null ? (int) $invoice->gateway_paid_amount : null,
            'gateway_updated_at' => $invoice->gateway_updated_at?->toIso8601String(),
            'qris_payload' => $invoice->qris_payload,
            'qris_expired_at' => $invoice->qris_expired_at?->toIso8601String(),
            'issued_at' => $invoice->issued_at?->toIso8601String(),
            'due_at' => $invoice->due_at?->toIso8601String(),
            'paid_verified_at' => $invoice->paid_verified_at?->toIso8601String(),
            'created_at' => $invoice->created_at?->toIso8601String(),
            'updated_at' => $invoice->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeIntent(SubscriptionPaymentIntent $intent): array
    {
        return [
            'id' => $intent->id,
            'invoice_id' => $intent->invoice_id,
            'tenant_id' => $intent->tenant_id,
            'provider' => $intent->provider,
            'intent_reference' => $intent->intent_reference,
            'amount_total' => (int) $intent->amount_total,
            'currency' => $intent->currency,
            'status' => $intent->status,
            'qris_payload' => $intent->qris_payload,
            'expires_at' => $intent->expires_at?->toIso8601String(),
            'created_at' => $intent->created_at?->toIso8601String(),
            'updated_at' => $intent->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeEvent(SubscriptionPaymentEvent $event): array
    {
        return [
            'id' => $event->id,
            'invoice_id' => $event->invoice_id,
            'tenant_id' => $event->tenant_id,
            'provider' => $event->provider,
            'gateway_event_id' => $event->gateway_event_id,
            'event_type' => $event->event_type,
            'event_status' => $event->event_status,
            'amount_total' => $event->amount_total !== null ? (int) $event->amount_total : null,
            'currency' => $event->currency,
            'gateway_reference' => $event->gateway_reference,
            'signature_valid' => (bool) $event->signature_valid,
            'process_status' => $event->process_status,
            'rejection_reason' => $event->rejection_reason,
            'received_at' => $event->received_at?->toIso8601String(),
            'processed_at' => $event->processed_at?->toIso8601String(),
            'created_at' => $event->created_at?->toIso8601String(),
            'updated_at' => $event->updated_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeProof(SubscriptionPaymentProof $proof): array
    {
        return [
            'id' => $proof->id,
            'invoice_id' => $proof->invoice_id,
            'tenant_id' => $proof->tenant_id,
            'status' => $proof->status,
            'file_name' => $proof->file_name,
            'mime_type' => $proof->mime_type,
            'file_size' => $proof->file_size,
            'checksum_sha256' => $proof->checksum_sha256,
            'review_note' => $proof->review_note,
            'reviewed_at' => $proof->reviewed_at?->toIso8601String(),
            'created_at' => $proof->created_at?->toIso8601String(),
            'updated_at' => $proof->updated_at?->toIso8601String(),
        ];
    }
}
