<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\SubscriptionCycle;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentEvent;
use App\Models\SubscriptionPaymentProof;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlatformSubscriptionController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function tenants(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['platform_owner', 'platform_billing']);

        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'state' => ['nullable', 'string', 'in:active,past_due,suspended'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $limit = (int) ($validated['limit'] ?? 50);
        $query = Tenant::query()
            ->with([
                'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
                'currentSubscriptionCycle:id,tenant_id,plan_id,status,cycle_start_at,cycle_end_at,auto_renew',
                'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
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

        $tenants = $query->limit($limit)->get(['id', 'name', 'current_plan_id', 'current_subscription_cycle_id', 'subscription_state', 'write_access_mode', 'status', 'created_at', 'updated_at']);

        return response()->json([
            'data' => $tenants->map(function (Tenant $tenant): array {
                $nextDueInvoice = SubscriptionInvoice::query()
                    ->where('tenant_id', $tenant->id)
                    ->whereIn('status', ['issued', 'pending_verification', 'overdue'])
                    ->orderBy('due_at')
                    ->first(['id', 'invoice_no', 'status', 'due_at', 'amount_total', 'currency']);

                $latestGatewayTransaction = SubscriptionPaymentEvent::query()
                    ->where('tenant_id', $tenant->id)
                    ->latest('received_at')
                    ->first(['id', 'invoice_id', 'gateway_event_id', 'event_type', 'process_status', 'rejection_reason', 'received_at']);

                return [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'status' => $tenant->status,
                    'subscription_state' => (string) ($tenant->subscription_state ?: 'active'),
                    'write_access_mode' => (string) ($tenant->write_access_mode ?: 'full'),
                    'current_plan' => $tenant->currentPlan ? [
                        'id' => $tenant->currentPlan->id,
                        'key' => $tenant->currentPlan->key,
                        'name' => $tenant->currentPlan->name,
                        'orders_limit' => $tenant->currentPlan->orders_limit,
                        'monthly_price_amount' => (int) ($tenant->currentPlan->monthly_price_amount ?? 0),
                        'currency' => $tenant->currentPlan->currency ?? 'IDR',
                    ] : null,
                    'current_cycle' => $tenant->currentSubscriptionCycle ? [
                        'id' => $tenant->currentSubscriptionCycle->id,
                        'status' => $tenant->currentSubscriptionCycle->status,
                        'cycle_start_at' => $tenant->currentSubscriptionCycle->cycle_start_at?->toIso8601String(),
                        'cycle_end_at' => $tenant->currentSubscriptionCycle->cycle_end_at?->toIso8601String(),
                        'auto_renew' => (bool) $tenant->currentSubscriptionCycle->auto_renew,
                    ] : null,
                    'next_due_invoice' => $nextDueInvoice ? [
                        'id' => $nextDueInvoice->id,
                        'invoice_no' => $nextDueInvoice->invoice_no,
                        'status' => $nextDueInvoice->status,
                        'amount_total' => (int) $nextDueInvoice->amount_total,
                        'currency' => $nextDueInvoice->currency,
                        'due_at' => $nextDueInvoice->due_at?->toIso8601String(),
                    ] : null,
                    'latest_gateway_transaction' => $latestGatewayTransaction ? [
                        'id' => $latestGatewayTransaction->id,
                        'invoice_id' => $latestGatewayTransaction->invoice_id,
                        'gateway_event_id' => $latestGatewayTransaction->gateway_event_id,
                        'event_type' => $latestGatewayTransaction->event_type,
                        'process_status' => $latestGatewayTransaction->process_status,
                        'rejection_reason' => $latestGatewayTransaction->rejection_reason,
                        'received_at' => $latestGatewayTransaction->received_at?->toIso8601String(),
                    ] : null,
                ];
            })->values(),
        ]);
    }

    public function tenantDetail(Request $request, Tenant $tenant): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['platform_owner', 'platform_billing']);

        $tenant->load([
            'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
            'currentSubscriptionCycle:id,tenant_id,plan_id,status,orders_limit_snapshot,cycle_start_at,cycle_end_at,auto_renew,activated_at',
            'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
        ]);

        $invoices = SubscriptionInvoice::query()
            ->with([
                'proofs' => fn ($q) => $q->latest('created_at'),
                'paymentEvents' => fn ($q) => $q->latest('received_at'),
            ])
            ->where('tenant_id', $tenant->id)
            ->latest('issued_at')
            ->limit(20)
            ->get();

        $latestGatewayTransaction = SubscriptionPaymentEvent::query()
            ->where('tenant_id', $tenant->id)
            ->latest('received_at')
            ->first();

        return response()->json([
            'data' => [
                'tenant' => [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'status' => $tenant->status,
                    'subscription_state' => (string) ($tenant->subscription_state ?: 'active'),
                    'write_access_mode' => (string) ($tenant->write_access_mode ?: 'full'),
                ],
                'current_plan' => $tenant->currentPlan ? [
                    'id' => $tenant->currentPlan->id,
                    'key' => $tenant->currentPlan->key,
                    'name' => $tenant->currentPlan->name,
                    'orders_limit' => $tenant->currentPlan->orders_limit,
                    'monthly_price_amount' => (int) ($tenant->currentPlan->monthly_price_amount ?? 0),
                    'currency' => $tenant->currentPlan->currency ?? 'IDR',
                ] : null,
                'current_cycle' => $tenant->currentSubscriptionCycle ? [
                    'id' => $tenant->currentSubscriptionCycle->id,
                    'status' => $tenant->currentSubscriptionCycle->status,
                    'orders_limit_snapshot' => $tenant->currentSubscriptionCycle->orders_limit_snapshot,
                    'cycle_start_at' => $tenant->currentSubscriptionCycle->cycle_start_at?->toIso8601String(),
                    'cycle_end_at' => $tenant->currentSubscriptionCycle->cycle_end_at?->toIso8601String(),
                    'auto_renew' => (bool) $tenant->currentSubscriptionCycle->auto_renew,
                    'activated_at' => $tenant->currentSubscriptionCycle->activated_at?->toIso8601String(),
                ] : null,
                'latest_gateway_transaction' => $latestGatewayTransaction ? [
                    'id' => $latestGatewayTransaction->id,
                    'invoice_id' => $latestGatewayTransaction->invoice_id,
                    'gateway_event_id' => $latestGatewayTransaction->gateway_event_id,
                    'event_type' => $latestGatewayTransaction->event_type,
                    'event_status' => $latestGatewayTransaction->event_status,
                    'amount_total' => $latestGatewayTransaction->amount_total !== null ? (int) $latestGatewayTransaction->amount_total : null,
                    'currency' => $latestGatewayTransaction->currency,
                    'gateway_reference' => $latestGatewayTransaction->gateway_reference,
                    'process_status' => $latestGatewayTransaction->process_status,
                    'rejection_reason' => $latestGatewayTransaction->rejection_reason,
                    'received_at' => $latestGatewayTransaction->received_at?->toIso8601String(),
                    'processed_at' => $latestGatewayTransaction->processed_at?->toIso8601String(),
                ] : null,
                'invoices' => $invoices->map(function (SubscriptionInvoice $invoice): array {
                    $latestEvent = $invoice->paymentEvents->first();

                    return [
                        'id' => $invoice->id,
                        'invoice_no' => $invoice->invoice_no,
                        'status' => $invoice->status,
                        'payment_method' => $invoice->payment_method,
                        'gateway_provider' => $invoice->gateway_provider,
                        'gateway_reference' => $invoice->gateway_reference,
                        'gateway_status' => $invoice->gateway_status,
                        'gateway_paid_amount' => $invoice->gateway_paid_amount !== null ? (int) $invoice->gateway_paid_amount : null,
                        'gateway_updated_at' => $invoice->gateway_updated_at?->toIso8601String(),
                        'amount_total' => (int) $invoice->amount_total,
                        'currency' => $invoice->currency,
                        'issued_at' => $invoice->issued_at?->toIso8601String(),
                        'due_at' => $invoice->due_at?->toIso8601String(),
                        'paid_verified_at' => $invoice->paid_verified_at?->toIso8601String(),
                        'latest_event' => $latestEvent ? [
                            'id' => $latestEvent->id,
                            'gateway_event_id' => $latestEvent->gateway_event_id,
                            'event_type' => $latestEvent->event_type,
                            'event_status' => $latestEvent->event_status,
                            'amount_total' => $latestEvent->amount_total !== null ? (int) $latestEvent->amount_total : null,
                            'currency' => $latestEvent->currency,
                            'process_status' => $latestEvent->process_status,
                            'received_at' => $latestEvent->received_at?->toIso8601String(),
                        ] : null,
                        'proofs' => $invoice->proofs->map(function (SubscriptionPaymentProof $proof): array {
                            return [
                                'id' => $proof->id,
                                'status' => $proof->status,
                                'file_name' => $proof->file_name,
                                'mime_type' => $proof->mime_type,
                                'file_size' => $proof->file_size,
                                'review_note' => $proof->review_note,
                                'reviewed_at' => $proof->reviewed_at?->toIso8601String(),
                                'created_at' => $proof->created_at?->toIso8601String(),
                            ];
                        })->values(),
                    ];
                })->values(),
            ],
        ]);
    }

    public function verifyInvoice(Request $request, string $invoiceId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['platform_owner', 'platform_billing']);

        $validated = $request->validate([
            'decision' => ['required', 'string', 'in:approve,reject'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $invoice = SubscriptionInvoice::query()
            ->with(['proofs' => fn ($query) => $query->latest('created_at')])
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
                'reason_code' => 'AUTO_VERIFIED_GATEWAY',
                'message' => 'Manual verification is not allowed for bri_qris invoices.',
            ], 422);
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

            $tenant = Tenant::query()->whereKey($invoice->tenant_id)->first();
            if ($tenant) {
                $tenant->forceFill([
                    'subscription_state' => 'active',
                    'write_access_mode' => 'full',
                ])->save();
            }
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
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'invoice' => [
                    'id' => $invoice->id,
                    'status' => $invoice->status,
                    'paid_verified_at' => $invoice->paid_verified_at?->toIso8601String(),
                    'verified_by' => $invoice->verified_by,
                ],
                'proof' => $proof ? [
                    'id' => $proof->id,
                    'status' => $proof->status,
                    'reviewed_at' => $proof->reviewed_at?->toIso8601String(),
                    'review_note' => $proof->review_note,
                ] : null,
            ],
        ]);
    }

    public function paymentEvents(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['platform_owner', 'platform_billing']);

        $validated = $request->validate([
            'tenant_id' => ['nullable', 'string', 'exists:tenants,id'],
            'invoice_id' => ['nullable', 'string', 'exists:subscription_invoices,id'],
            'status' => ['nullable', 'string', 'max:40'],
            'q' => ['nullable', 'string', 'max:120'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:200'],
        ]);

        $limit = (int) ($validated['limit'] ?? 50);
        $query = SubscriptionPaymentEvent::query()
            ->with([
                'tenant:id,name',
                'invoice:id,invoice_no,payment_method,status',
            ])
            ->latest('received_at');

        if (! empty($validated['tenant_id'])) {
            $query->where('tenant_id', $validated['tenant_id']);
        }

        if (! empty($validated['invoice_id'])) {
            $query->where('invoice_id', $validated['invoice_id']);
        }

        if (! empty($validated['status'])) {
            $query->where('process_status', $validated['status']);
        }

        if (! empty($validated['q'])) {
            $keyword = trim((string) $validated['q']);
            $query->where(function ($q) use ($keyword): void {
                $q->where('gateway_event_id', 'like', '%'.$keyword.'%')
                    ->orWhere('gateway_reference', 'like', '%'.$keyword.'%')
                    ->orWhereHas('tenant', function ($tenantQuery) use ($keyword): void {
                        $tenantQuery->where('name', 'like', '%'.$keyword.'%')
                            ->orWhere('id', 'like', '%'.$keyword.'%');
                    })
                    ->orWhereHas('invoice', function ($invoiceQuery) use ($keyword): void {
                        $invoiceQuery->where('invoice_no', 'like', '%'.$keyword.'%');
                    });
            });
        }

        $events = $query->limit($limit)->get();

        return response()->json([
            'data' => $events->map(function (SubscriptionPaymentEvent $event): array {
                return [
                    'id' => $event->id,
                    'tenant' => $event->tenant ? [
                        'id' => $event->tenant->id,
                        'name' => $event->tenant->name,
                    ] : null,
                    'invoice' => $event->invoice ? [
                        'id' => $event->invoice->id,
                        'invoice_no' => $event->invoice->invoice_no,
                        'payment_method' => $event->invoice->payment_method,
                        'status' => $event->invoice->status,
                    ] : null,
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
                ];
            })->values(),
        ]);
    }

    public function suspendTenant(Request $request, Tenant $tenant): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['platform_owner']);

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
        ]);

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
                'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'tenant_id' => $tenant->id,
                'subscription_state' => $tenant->subscription_state,
                'write_access_mode' => $tenant->write_access_mode,
            ],
        ]);
    }

    public function activateTenant(Request $request, Tenant $tenant): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['platform_owner']);

        $validated = $request->validate([
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        $tenant->forceFill([
            'subscription_state' => 'active',
            'write_access_mode' => 'full',
        ])->save();

        if (! $tenant->current_subscription_cycle_id) {
            $startAt = now();
            $endAt = $startAt->copy()->addDays(30)->subSecond();
            $planId = $tenant->current_plan_id;

            if ($planId) {
                $cycle = SubscriptionCycle::query()->create([
                    'tenant_id' => $tenant->id,
                    'plan_id' => $planId,
                    'orders_limit_snapshot' => $tenant->currentPlan?->orders_limit,
                    'status' => 'active',
                    'cycle_start_at' => $startAt,
                    'cycle_end_at' => $endAt,
                    'activated_at' => $startAt,
                    'auto_renew' => true,
                    'source' => 'platform_manual_activate',
                    'created_by' => $user->id,
                    'updated_by' => $user->id,
                ]);

                $tenant->forceFill([
                    'current_subscription_cycle_id' => $cycle->id,
                ])->save();
            }
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PLATFORM_TENANT_ACTIVATED,
            actor: $user,
            tenantId: $tenant->id,
            entityType: 'tenant',
            entityId: $tenant->id,
            metadata: [
                'note' => trim((string) ($validated['note'] ?? '')) ?: null,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => [
                'tenant_id' => $tenant->id,
                'subscription_state' => $tenant->subscription_state,
                'write_access_mode' => $tenant->write_access_mode,
                'current_subscription_cycle_id' => $tenant->current_subscription_cycle_id,
            ],
        ]);
    }
}
