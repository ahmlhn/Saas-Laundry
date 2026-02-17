<?php

namespace App\Http\Controllers\Api;

use App\Domain\Billing\QuotaExceededException;
use App\Domain\Billing\QuotaService;
use App\Domain\Invoices\InvoiceLeaseService;
use App\Domain\Messaging\WaDispatchService;
use App\Domain\Orders\OrderStatusTransitionValidator;
use App\Domain\Sync\SyncChangeRecorder;
use App\Domain\Sync\SyncRejectException;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Payment;
use App\Models\Service;
use App\Models\SyncChange;
use App\Models\SyncMutation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SyncController extends Controller
{
    public function __construct(
        private readonly SyncChangeRecorder $changeRecorder,
        private readonly InvoiceLeaseService $invoiceLeaseService,
        private readonly OrderStatusTransitionValidator $statusValidator,
        private readonly QuotaService $quotaService,
        private readonly WaDispatchService $waDispatchService,
    ) {
    }

    public function push(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        $validated = $request->validate([
            'device_id' => ['required', 'uuid'],
            'last_known_server_cursor' => ['nullable', 'integer', 'min:0'],
            'mutations' => ['required', 'array', 'min:1'],
            'mutations.*.mutation_id' => ['required', 'string', 'max:64'],
            'mutations.*.seq' => ['nullable', 'integer', 'min:0'],
            'mutations.*.type' => ['required', 'string', 'max:60'],
            'mutations.*.outlet_id' => ['nullable', 'uuid'],
            'mutations.*.entity' => ['nullable', 'array'],
            'mutations.*.entity.entity_type' => ['nullable', 'string', 'max:50'],
            'mutations.*.entity.entity_id' => ['nullable', 'string', 'max:80'],
            'mutations.*.client_time' => ['nullable', 'date'],
            'mutations.*.payload' => ['nullable', 'array'],
        ]);

        $device = $this->upsertDevice($user, $validated['device_id']);
        $ack = [];
        $rejected = [];

        foreach ($validated['mutations'] as $mutationInput) {
            $existing = SyncMutation::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('mutation_id', $mutationInput['mutation_id'])
                ->first();

            if ($existing) {
                if (in_array($existing->status, ['applied', 'duplicate'], true)) {
                    $ack[] = [
                        'mutation_id' => $existing->mutation_id,
                        'status' => 'duplicate',
                        'server_cursor' => $existing->server_cursor,
                        'entity_refs' => $this->extractEntityRefs($existing),
                        'effects' => $existing->effects ?? (object) [],
                    ];
                } else {
                    $rejected[] = [
                        'mutation_id' => $existing->mutation_id,
                        'status' => 'rejected',
                        'reason_code' => $existing->reason_code ?? 'VALIDATION_FAILED',
                        'message' => $existing->message ?? 'Mutation rejected previously.',
                    ];
                }

                continue;
            }

            try {
                $result = $this->applyMutation($user, $device, $mutationInput, $sourceChannel);

                SyncMutation::query()->create([
                    'tenant_id' => $user->tenant_id,
                    'device_id' => $device->id,
                    'mutation_id' => $mutationInput['mutation_id'],
                    'seq' => $mutationInput['seq'] ?? null,
                    'type' => $mutationInput['type'],
                    'outlet_id' => $mutationInput['outlet_id'] ?? null,
                    'entity_type' => $mutationInput['entity']['entity_type'] ?? null,
                    'entity_id' => $mutationInput['entity']['entity_id'] ?? null,
                    'payload_json' => $mutationInput['payload'] ?? [],
                    'client_time' => $mutationInput['client_time'] ?? null,
                    'status' => 'applied',
                    'server_cursor' => $result['server_cursor'] ?? null,
                    'effects' => $result['effects'] ?? [],
                    'processed_at' => now(),
                    'created_by' => $user->id,
                    'updated_by' => $user->id,
                    'source_channel' => $sourceChannel,
                ]);

                $ack[] = [
                    'mutation_id' => $mutationInput['mutation_id'],
                    'status' => 'applied',
                    'server_cursor' => $result['server_cursor'] ?? null,
                    'entity_refs' => $result['entity_refs'] ?? [],
                    'effects' => $result['effects'] ?? (object) [],
                ];
            } catch (SyncRejectException $e) {
                SyncMutation::query()->create([
                    'tenant_id' => $user->tenant_id,
                    'device_id' => $device->id,
                    'mutation_id' => $mutationInput['mutation_id'],
                    'seq' => $mutationInput['seq'] ?? null,
                    'type' => $mutationInput['type'],
                    'outlet_id' => $mutationInput['outlet_id'] ?? null,
                    'entity_type' => $mutationInput['entity']['entity_type'] ?? null,
                    'entity_id' => $mutationInput['entity']['entity_id'] ?? null,
                    'payload_json' => $mutationInput['payload'] ?? [],
                    'client_time' => $mutationInput['client_time'] ?? null,
                    'status' => 'rejected',
                    'reason_code' => $e->reasonCode,
                    'message' => $e->getMessage(),
                    'processed_at' => now(),
                    'created_by' => $user->id,
                    'updated_by' => $user->id,
                    'source_channel' => $sourceChannel,
                ]);

                $rejected[] = [
                    'mutation_id' => $mutationInput['mutation_id'],
                    'status' => 'rejected',
                    'reason_code' => $e->reasonCode,
                    'message' => $e->getMessage(),
                    'current_server_state' => $e->currentState,
                ];
            } catch (ValidationException $e) {
                $message = $e->validator->errors()->first() ?: 'Validation failed.';

                SyncMutation::query()->create([
                    'tenant_id' => $user->tenant_id,
                    'device_id' => $device->id,
                    'mutation_id' => $mutationInput['mutation_id'],
                    'seq' => $mutationInput['seq'] ?? null,
                    'type' => $mutationInput['type'],
                    'outlet_id' => $mutationInput['outlet_id'] ?? null,
                    'entity_type' => $mutationInput['entity']['entity_type'] ?? null,
                    'entity_id' => $mutationInput['entity']['entity_id'] ?? null,
                    'payload_json' => $mutationInput['payload'] ?? [],
                    'client_time' => $mutationInput['client_time'] ?? null,
                    'status' => 'rejected',
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => $message,
                    'processed_at' => now(),
                    'created_by' => $user->id,
                    'updated_by' => $user->id,
                    'source_channel' => $sourceChannel,
                ]);

                $rejected[] = [
                    'mutation_id' => $mutationInput['mutation_id'],
                    'status' => 'rejected',
                    'reason_code' => 'VALIDATION_FAILED',
                    'message' => $message,
                ];
            }
        }

        return response()->json([
            'server_time' => now()->toIso8601String(),
            'ack' => $ack,
            'rejected' => $rejected,
            'quota' => $this->quotaPayload($user),
        ]);
    }

    public function pull(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'device_id' => ['required', 'uuid'],
            'cursor' => ['nullable', 'integer', 'min:0'],
            'scope' => ['required', 'array'],
            'scope.mode' => ['required', 'in:selected_outlet,all_outlets'],
            'scope.outlet_id' => ['required_if:scope.mode,selected_outlet', 'uuid'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $this->upsertDevice($user, $validated['device_id']);

        $mode = $validated['scope']['mode'];
        $cursor = (int) ($validated['cursor'] ?? 0);
        $limit = (int) ($validated['limit'] ?? 200);

        $query = SyncChange::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('cursor', '>', $cursor);

        if ($mode === 'selected_outlet') {
            $outlet = $this->assertOutletAccess($user, $validated['scope']['outlet_id']);
            $query->where(function ($q) use ($outlet): void {
                $q->whereNull('outlet_id')
                    ->orWhere('outlet_id', $outlet->id);
            });
        } else {
            $this->ensureRole($user, ['owner']);
        }

        $rows = $query
            ->orderBy('cursor')
            ->limit($limit + 1)
            ->get();

        $hasMore = $rows->count() > $limit;
        $changes = $rows->take($limit);
        $nextCursor = $changes->count() > 0 ? (int) $changes->last()->cursor : $cursor;

        return response()->json([
            'server_time' => now()->toIso8601String(),
            'next_cursor' => $nextCursor,
            'has_more' => $hasMore,
            'changes' => $changes->map(fn (SyncChange $change): array => [
                'change_id' => $change->change_id,
                'entity_type' => $change->entity_type,
                'entity_id' => $change->entity_id,
                'op' => $change->op,
                'updated_at' => $change->updated_at->toIso8601String(),
                'data' => $change->data_json,
            ])->values(),
            'quota' => $this->quotaPayload($user),
        ]);
    }

    /**
     * @param array<string, mixed> $mutation
     * @return array{server_cursor: int|null, entity_refs: array<int, array{entity_type: string, entity_id: string}>, effects: array<string, mixed>}
     */
    private function applyMutation(User $user, Device $device, array $mutation, string $sourceChannel): array
    {
        $type = strtoupper($mutation['type']);

        return match ($type) {
            'ORDER_CREATE' => $this->applyOrderCreateMutation($user, $device, $mutation, $sourceChannel),
            'ORDER_ADD_PAYMENT' => $this->applyOrderAddPaymentMutation($user, $mutation, $sourceChannel),
            'ORDER_UPDATE_LAUNDRY_STATUS' => $this->applyOrderLaundryStatusMutation($user, $mutation, $sourceChannel),
            'ORDER_UPDATE_COURIER_STATUS' => $this->applyOrderCourierStatusMutation($user, $mutation, $sourceChannel),
            'ORDER_ASSIGN_COURIER' => $this->applyOrderAssignCourierMutation($user, $mutation, $sourceChannel),
            default => throw new SyncRejectException('VALIDATION_FAILED', "Unsupported mutation type: {$type}."),
        };
    }

    /**
     * @param array<string, mixed> $mutation
     * @return array{server_cursor: int|null, entity_refs: array<int, array{entity_type: string, entity_id: string}>, effects: array<string, mixed>}
     */
    private function applyOrderCreateMutation(User $user, Device $device, array $mutation, string $sourceChannel): array
    {
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $payload = $mutation['payload'] ?? [];

        $validator = validator($payload, [
            'outlet_id' => ['nullable', 'uuid'],
            'order_code' => ['nullable', 'string', 'max:32'],
            'invoice_no' => ['nullable', 'string', 'max:50'],
            'is_pickup_delivery' => ['nullable', 'boolean'],
            'shipping_fee_amount' => ['nullable', 'integer', 'min:0'],
            'discount_amount' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string'],
            'pickup' => ['nullable', 'array'],
            'delivery' => ['nullable', 'array'],
            'customer' => ['required', 'array'],
            'customer.name' => ['required', 'string', 'max:150'],
            'customer.phone' => ['required', 'string', 'max:30'],
            'customer.notes' => ['nullable', 'string'],
            'customer.client_id' => ['nullable', 'string', 'max:80'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'uuid'],
            'items.*.qty' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.weight_kg' => ['nullable', 'numeric', 'min:0.01'],
        ]);
        $validated = $validator->validate();

        $outletId = $mutation['outlet_id'] ?? $validated['outlet_id'] ?? null;

        if (! is_string($outletId) || $outletId === '') {
            throw new SyncRejectException('VALIDATION_FAILED', 'outlet_id is required.');
        }

        $outlet = $this->assertOutletAccess($user, $outletId);
        $orderTime = isset($mutation['client_time']) ? Carbon::parse($mutation['client_time']) : now();

        if (! empty($validated['order_code'])) {
            $exists = Order::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('order_code', $validated['order_code'])
                ->exists();

            if ($exists) {
                throw new SyncRejectException('VALIDATION_FAILED', 'order_code already exists.');
            }
        }

        $result = DB::transaction(function () use ($validated, $user, $device, $outlet, $orderTime, $sourceChannel): array {
            try {
                $this->quotaService->consumeOrderSlot($user->tenant_id, $orderTime->format('Y-m'));
            } catch (QuotaExceededException $e) {
                throw new SyncRejectException(
                    reasonCode: 'QUOTA_EXCEEDED',
                    message: 'Order quota for the current period has been reached.',
                );
            }

            $phone = $this->normalizePhone($validated['customer']['phone']);

            if (! $phone) {
                throw new SyncRejectException('PHONE_INVALID', 'Invalid phone number format.');
            }

            $customer = Customer::query()->updateOrCreate(
                ['tenant_id' => $user->tenant_id, 'phone_normalized' => $phone],
                [
                    'name' => $validated['customer']['name'],
                    'notes' => $validated['customer']['notes'] ?? null,
                ]
            );

            $invoiceResult = $this->invoiceLeaseService->validateOrAssignInvoice(
                tenantId: $user->tenant_id,
                device: $device,
                outlet: $outlet,
                orderTime: $orderTime,
                clientInvoiceNo: $validated['invoice_no'] ?? null
            );

            $order = Order::query()->create([
                'tenant_id' => $user->tenant_id,
                'outlet_id' => $outlet->id,
                'customer_id' => $customer->id,
                'invoice_no' => $invoiceResult['invoice_no'],
                'order_code' => $validated['order_code'] ?? $this->generateOrderCode(),
                'is_pickup_delivery' => (bool) ($validated['is_pickup_delivery'] ?? false),
                'laundry_status' => 'received',
                'courier_status' => ($validated['is_pickup_delivery'] ?? false) ? 'pickup_pending' : null,
                'shipping_fee_amount' => (int) ($validated['shipping_fee_amount'] ?? 0),
                'discount_amount' => (int) ($validated['discount_amount'] ?? 0),
                'total_amount' => 0,
                'paid_amount' => 0,
                'due_amount' => 0,
                'pickup' => $validated['pickup'] ?? null,
                'delivery' => $validated['delivery'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'created_by' => $user->id,
                'updated_by' => $user->id,
                'source_channel' => $sourceChannel,
            ]);

            $order->forceFill([
                'created_at' => $orderTime,
                'updated_at' => $orderTime,
                'updated_by' => $user->id,
                'source_channel' => $sourceChannel,
            ])->save();

            $subTotal = 0;
            $lastCursor = null;

            foreach ($validated['items'] as $item) {
                $service = Service::query()
                    ->where('id', $item['service_id'])
                    ->where('tenant_id', $user->tenant_id)
                    ->where('active', true)
                    ->first();

                if (! $service) {
                    throw new SyncRejectException('VALIDATION_FAILED', "Service {$item['service_id']} is invalid.");
                }

                $outletService = OutletService::query()
                    ->where('outlet_id', $outlet->id)
                    ->where('service_id', $service->id)
                    ->where('active', true)
                    ->first();

                $unitPrice = (int) ($outletService?->price_override_amount ?? $service->base_price_amount);

                $qty = isset($item['qty']) ? (float) $item['qty'] : null;
                $weight = isset($item['weight_kg']) ? (float) $item['weight_kg'] : null;

                if ($service->unit_type === 'kg' && ! $weight) {
                    throw new SyncRejectException('VALIDATION_FAILED', 'weight_kg is required for kg service.');
                }

                if ($service->unit_type === 'pcs' && ! $qty) {
                    throw new SyncRejectException('VALIDATION_FAILED', 'qty is required for pcs service.');
                }

                $metric = $service->unit_type === 'kg' ? (float) $weight : (float) $qty;
                $lineSubTotal = (int) round($metric * $unitPrice);
                $subTotal += $lineSubTotal;

                $orderItem = OrderItem::query()->create([
                    'order_id' => $order->id,
                    'service_id' => $service->id,
                    'service_name_snapshot' => $service->name,
                    'unit_type_snapshot' => $service->unit_type,
                    'qty' => $qty,
                    'weight_kg' => $weight,
                    'unit_price_amount' => $unitPrice,
                    'subtotal_amount' => $lineSubTotal,
                ]);

                $itemChange = $this->changeRecorder->record(
                    tenantId: $user->tenant_id,
                    outletId: $outlet->id,
                    entityType: 'order_item',
                    entityId: $orderItem->id,
                    op: 'upsert',
                    data: $orderItem->toArray(),
                );
                $lastCursor = (int) $itemChange->cursor;
            }

            $total = max($subTotal + (int) ($validated['shipping_fee_amount'] ?? 0) - (int) ($validated['discount_amount'] ?? 0), 0);

            $order->forceFill([
                'total_amount' => $total,
                'due_amount' => $total,
                'paid_amount' => 0,
                'updated_at' => $orderTime,
                'updated_by' => $user->id,
                'source_channel' => $sourceChannel,
            ])->save();

            $customerChange = $this->changeRecorder->record(
                tenantId: $user->tenant_id,
                outletId: null,
                entityType: 'customer',
                entityId: $customer->id,
                op: 'upsert',
                data: $customer->toArray(),
            );
            $lastCursor = (int) $customerChange->cursor;

            $orderChange = $this->changeRecorder->record(
                tenantId: $user->tenant_id,
                outletId: $outlet->id,
                entityType: 'order',
                entityId: $order->id,
                op: 'upsert',
                data: $order->toArray(),
            );
            $lastCursor = (int) $orderChange->cursor;

            $effects = [];

            if ($invoiceResult['invoice_no_assigned']) {
                $effects['invoice_no_assigned'] = $invoiceResult['invoice_no_assigned'];
            }

            if (! empty($validated['customer']['client_id'])) {
                $effects['id_map'] = [
                    'customer_client_id' => $validated['customer']['client_id'],
                    'customer_server_id' => $customer->id,
                ];
            }

            return [
                'server_cursor' => $lastCursor,
                'order_id' => $order->id,
                'is_pickup_delivery' => $order->is_pickup_delivery,
                'entity_refs' => [
                    ['entity_type' => 'order', 'entity_id' => $order->id],
                    ['entity_type' => 'customer', 'entity_id' => $customer->id],
                ],
                'effects' => $effects,
            ];
        });

        if (($result['is_pickup_delivery'] ?? false) && ! empty($result['order_id'])) {
            $order = Order::query()->find($result['order_id']);

            if ($order) {
                $this->waDispatchService->enqueueOrderEvent($order, 'WA_PICKUP_CONFIRM', metadata: [
                    'event' => 'order_created',
                    'source' => 'sync',
                    'actor_user_id' => $user->id,
                    'source_channel' => $sourceChannel,
                ]);
            }
        }

        unset($result['order_id'], $result['is_pickup_delivery']);

        return $result;
    }

    /**
     * @param array<string, mixed> $mutation
     * @return array{server_cursor: int|null, entity_refs: array<int, array{entity_type: string, entity_id: string}>, effects: array<string, mixed>}
     */
    private function applyOrderAddPaymentMutation(User $user, array $mutation, string $sourceChannel): array
    {
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $payload = $mutation['payload'] ?? [];
        $validator = validator($payload, [
            'order_id' => ['nullable', 'uuid'],
            'amount' => ['required', 'integer', 'min:1'],
            'method' => ['required', 'string', 'max:30'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);
        $validated = $validator->validate();

        $orderId = $mutation['entity']['entity_id'] ?? $validated['order_id'] ?? null;

        if (! is_string($orderId) || $orderId === '') {
            throw new SyncRejectException('VALIDATION_FAILED', 'order_id is required.');
        }

        /** @var Order|null $order */
        $order = Order::query()->where('id', $orderId)->where('tenant_id', $user->tenant_id)->first();

        if (! $order) {
            throw new SyncRejectException('VALIDATION_FAILED', 'Order not found.');
        }

        $this->assertOutletAccess($user, $order->outlet_id);

        return DB::transaction(function () use ($user, $order, $validated): array {
            $payment = Payment::query()->create([
                'order_id' => $order->id,
                'amount' => (int) $validated['amount'],
                'method' => $validated['method'],
                'paid_at' => $validated['paid_at'] ?? now(),
                'notes' => $validated['notes'] ?? null,
                'created_by' => $user->id,
                'updated_by' => $user->id,
                'source_channel' => $sourceChannel,
            ]);

            $paidAmount = (int) Payment::query()->where('order_id', $order->id)->sum('amount');
            $dueAmount = max($order->total_amount - $paidAmount, 0);

            $order->forceFill([
                'paid_amount' => $paidAmount,
                'due_amount' => $dueAmount,
                'updated_by' => $user->id,
                'source_channel' => $sourceChannel,
            ])->save();

            $this->changeRecorder->record(
                tenantId: $user->tenant_id,
                outletId: $order->outlet_id,
                entityType: 'payment',
                entityId: $payment->id,
                op: 'upsert',
                data: $payment->toArray(),
            );

            $orderChange = $this->changeRecorder->record(
                tenantId: $user->tenant_id,
                outletId: $order->outlet_id,
                entityType: 'order',
                entityId: $order->id,
                op: 'upsert',
                data: $order->toArray(),
            );

            return [
                'server_cursor' => (int) $orderChange->cursor,
                'entity_refs' => [
                    ['entity_type' => 'payment', 'entity_id' => $payment->id],
                    ['entity_type' => 'order', 'entity_id' => $order->id],
                ],
                'effects' => [],
            ];
        });
    }

    /**
     * @param array<string, mixed> $mutation
     * @return array{server_cursor: int|null, entity_refs: array<int, array{entity_type: string, entity_id: string}>, effects: array<string, mixed>}
     */
    private function applyOrderLaundryStatusMutation(User $user, array $mutation, string $sourceChannel): array
    {
        $this->ensureRole($user, ['owner', 'admin', 'worker']);

        $payload = $mutation['payload'] ?? [];
        $validator = validator($payload, [
            'order_id' => ['nullable', 'uuid'],
            'status' => ['required', 'string', 'max:32'],
        ]);
        $validated = $validator->validate();

        $orderId = $mutation['entity']['entity_id'] ?? $validated['order_id'] ?? null;

        if (! is_string($orderId) || $orderId === '') {
            throw new SyncRejectException('VALIDATION_FAILED', 'order_id is required.');
        }

        /** @var Order|null $order */
        $order = Order::query()->where('id', $orderId)->where('tenant_id', $user->tenant_id)->first();

        if (! $order) {
            throw new SyncRejectException('VALIDATION_FAILED', 'Order not found.');
        }

        $this->assertOutletAccess($user, $order->outlet_id);

        $result = $this->statusValidator->validateLaundry($order->laundry_status, $validated['status']);

        if (! $result['ok']) {
            throw new SyncRejectException(
                reasonCode: $result['reason_code'] ?? 'INVALID_TRANSITION',
                message: $result['message'] ?? 'Invalid laundry status transition.',
                currentState: [
                    'entity_type' => 'order',
                    'entity_id' => $order->id,
                    'laundry_status' => $order->laundry_status,
                    'updated_at' => $order->updated_at?->toIso8601String(),
                ],
            );
        }

        $order->forceFill([
            'laundry_status' => $validated['status'],
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        if ($validated['status'] === 'ready') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_LAUNDRY_READY', metadata: [
                'event' => 'laundry_ready',
                'source' => 'sync',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        if ($validated['status'] === 'completed' && ! $order->is_pickup_delivery) {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_ORDER_DONE', metadata: [
                'event' => 'order_done',
                'source' => 'sync',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        $change = $this->changeRecorder->record(
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            op: 'upsert',
            data: $order->toArray(),
        );

        return [
            'server_cursor' => (int) $change->cursor,
            'entity_refs' => [['entity_type' => 'order', 'entity_id' => $order->id]],
            'effects' => [],
        ];
    }

    /**
     * @param array<string, mixed> $mutation
     * @return array{server_cursor: int|null, entity_refs: array<int, array{entity_type: string, entity_id: string}>, effects: array<string, mixed>}
     */
    private function applyOrderCourierStatusMutation(User $user, array $mutation, string $sourceChannel): array
    {
        $this->ensureRole($user, ['owner', 'admin', 'courier']);

        $payload = $mutation['payload'] ?? [];
        $validator = validator($payload, [
            'order_id' => ['nullable', 'uuid'],
            'status' => ['required', 'string', 'max:32'],
        ]);
        $validated = $validator->validate();

        $orderId = $mutation['entity']['entity_id'] ?? $validated['order_id'] ?? null;

        if (! is_string($orderId) || $orderId === '') {
            throw new SyncRejectException('VALIDATION_FAILED', 'order_id is required.');
        }

        /** @var Order|null $order */
        $order = Order::query()->where('id', $orderId)->where('tenant_id', $user->tenant_id)->first();

        if (! $order) {
            throw new SyncRejectException('VALIDATION_FAILED', 'Order not found.');
        }

        $this->assertOutletAccess($user, $order->outlet_id);

        if (! $order->is_pickup_delivery) {
            throw new SyncRejectException('INVALID_TRANSITION', 'Courier status is only valid for pickup-delivery orders.');
        }

        $current = $order->courier_status ?? 'pickup_pending';
        $result = $this->statusValidator->validateCourier($current, $validated['status']);

        if (! $result['ok']) {
            throw new SyncRejectException(
                reasonCode: $result['reason_code'] ?? 'INVALID_TRANSITION',
                message: $result['message'] ?? 'Invalid courier status transition.',
                currentState: [
                    'entity_type' => 'order',
                    'entity_id' => $order->id,
                    'courier_status' => $order->courier_status,
                    'updated_at' => $order->updated_at?->toIso8601String(),
                ],
            );
        }

        if ($validated['status'] === 'delivery_pending' && ! in_array($order->laundry_status, ['ready', 'completed'], true)) {
            throw new SyncRejectException('INVALID_TRANSITION', 'laundry_status must be ready before delivery_pending.');
        }

        $order->forceFill([
            'courier_status' => $validated['status'],
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        if ($validated['status'] === 'pickup_on_the_way') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_PICKUP_OTW', metadata: [
                'event' => 'courier_pickup_otw',
                'source' => 'sync',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        if ($validated['status'] === 'delivery_on_the_way') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_DELIVERY_OTW', metadata: [
                'event' => 'courier_delivery_otw',
                'source' => 'sync',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        if ($validated['status'] === 'delivered') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_ORDER_DONE', metadata: [
                'event' => 'order_done',
                'source' => 'sync',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        $change = $this->changeRecorder->record(
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            op: 'upsert',
            data: $order->toArray(),
        );

        return [
            'server_cursor' => (int) $change->cursor,
            'entity_refs' => [['entity_type' => 'order', 'entity_id' => $order->id]],
            'effects' => [],
        ];
    }

    /**
     * @param array<string, mixed> $mutation
     * @return array{server_cursor: int|null, entity_refs: array<int, array{entity_type: string, entity_id: string}>, effects: array<string, mixed>}
     */
    private function applyOrderAssignCourierMutation(User $user, array $mutation, string $sourceChannel): array
    {
        $this->ensureRole($user, ['owner', 'admin']);

        $payload = $mutation['payload'] ?? [];
        $validator = validator($payload, [
            'order_id' => ['nullable', 'uuid'],
            'courier_user_id' => ['required', 'integer'],
        ]);
        $validated = $validator->validate();

        $orderId = $mutation['entity']['entity_id'] ?? $validated['order_id'] ?? null;

        if (! is_string($orderId) || $orderId === '') {
            throw new SyncRejectException('VALIDATION_FAILED', 'order_id is required.');
        }

        /** @var Order|null $order */
        $order = Order::query()->where('id', $orderId)->where('tenant_id', $user->tenant_id)->first();

        if (! $order) {
            throw new SyncRejectException('VALIDATION_FAILED', 'Order not found.');
        }

        $this->assertOutletAccess($user, $order->outlet_id);

        if (! $order->is_pickup_delivery) {
            throw new SyncRejectException('VALIDATION_FAILED', 'Courier assignment is only for pickup-delivery orders.');
        }

        $courier = User::query()
            ->with('roles:id,key')
            ->where('id', $validated['courier_user_id'])
            ->where('tenant_id', $user->tenant_id)
            ->first();

        if (! $courier || ! $courier->hasRole('courier')) {
            throw new SyncRejectException('VALIDATION_FAILED', 'Assigned user must have courier role.');
        }

        $order->forceFill([
            'courier_user_id' => $courier->id,
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        $change = $this->changeRecorder->record(
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            op: 'upsert',
            data: $order->toArray(),
        );

        return [
            'server_cursor' => (int) $change->cursor,
            'entity_refs' => [['entity_type' => 'order', 'entity_id' => $order->id]],
            'effects' => [],
        ];
    }

    private function upsertDevice(User $user, string $deviceId): Device
    {
        $device = Device::query()->find($deviceId);

        if ($device && $device->tenant_id !== $user->tenant_id) {
            throw new SyncRejectException('OUTLET_ACCESS_DENIED', 'Device is bound to another tenant.');
        }

        return Device::query()->updateOrCreate(
            ['id' => $deviceId],
            [
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'last_seen_at' => now(),
            ]
        );
    }

    private function assertOutletAccess(User $user, string $outletId): Outlet
    {
        $outlet = Outlet::query()
            ->where('id', $outletId)
            ->where('tenant_id', $user->tenant_id)
            ->first();

        if (! $outlet) {
            throw new SyncRejectException('OUTLET_ACCESS_DENIED', 'Outlet not found in tenant scope.');
        }

        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if ($isOwner) {
            return $outlet;
        }

        $hasOutlet = DB::table('user_outlets')
            ->where('user_id', $user->id)
            ->where('outlet_id', $outlet->id)
            ->exists();

        if (! $hasOutlet) {
            throw new SyncRejectException('OUTLET_ACCESS_DENIED', 'You do not have access to this outlet.');
        }

        return $outlet;
    }

    /**
     * @param array<int, string> $roles
     */
    private function ensureRole(User $user, array $roles): void
    {
        $hasRole = $user->roles()->whereIn('key', $roles)->exists();

        if ($hasRole) {
            return;
        }

        throw new SyncRejectException('ROLE_ACCESS_DENIED', 'You are not allowed to perform this action.');
    }

    /**
     * @return array<int, array{entity_type: string, entity_id: string}>
     */
    private function extractEntityRefs(SyncMutation $mutation): array
    {
        if ($mutation->entity_type && $mutation->entity_id) {
            return [
                [
                    'entity_type' => $mutation->entity_type,
                    'entity_id' => $mutation->entity_id,
                ],
            ];
        }

        return [];
    }

    /**
     * @return array{plan: string|null, period: string, orders_limit: int|null, orders_used: int, orders_remaining: int|null, can_create_order: bool}
     */
    private function quotaPayload(User $user): array
    {
        return $this->quotaService->snapshot($user->tenant_id);
    }

    private function resolveSourceChannel(Request $request, string $fallback = 'mobile'): string
    {
        $raw = strtolower((string) $request->header('X-Source-Channel', $fallback));

        return in_array($raw, ['mobile', 'web', 'system'], true) ? $raw : $fallback;
    }

    private function normalizePhone(string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if ($digits === '') {
            return null;
        }

        if (Str::startsWith($digits, '00')) {
            $digits = substr($digits, 2);
        }

        if (Str::startsWith($digits, '0')) {
            $digits = '62'.substr($digits, 1);
        } elseif (Str::startsWith($digits, '8')) {
            $digits = '62'.$digits;
        }

        if (! Str::startsWith($digits, '62')) {
            return null;
        }

        if (strlen($digits) < 9 || strlen($digits) > 16) {
            return null;
        }

        return $digits;
    }

    private function generateOrderCode(): string
    {
        return 'ORD-'.strtoupper(Str::random(8));
    }
}
