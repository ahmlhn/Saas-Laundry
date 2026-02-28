<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaExceededException;
use App\Domain\Billing\QuotaService;
use App\Domain\Billing\TenantWriteAccessException;
use App\Domain\Messaging\WaDispatchService;
use App\Domain\Orders\OrderStatusTransitionValidator;
use App\Domain\Orders\OrderPaymentGatewayService;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderPaymentEvent;
use App\Models\OrderPaymentIntent;
use App\Models\OutletService;
use App\Models\Payment;
use App\Models\Service;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function __construct(
        private readonly QuotaService $quotaService,
        private readonly WaDispatchService $waDispatchService,
        private readonly AuditTrailService $auditTrail,
        private readonly OrderPaymentGatewayService $orderPaymentGatewayService,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier', 'worker', 'courier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'q' => ['nullable', 'string', 'max:100'],
            'status_scope' => ['nullable', 'string', 'in:all,open,completed'],
            'date' => ['nullable', 'date_format:Y-m-d'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'timezone' => ['nullable', 'timezone'],
        ]);

        $query = Order::query()
            ->with(['customer:id,name,phone_normalized', 'courier:id,name'])
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $validated['outlet_id'])
            ->latest('created_at');

        $statusScope = $validated['status_scope'] ?? 'all';
        if ($statusScope === 'open') {
            $query->where(function ($q): void {
                $q->where(function ($inner): void {
                    $inner->where('is_pickup_delivery', false)
                        ->where('laundry_status', '!=', 'completed');
                })->orWhere(function ($inner): void {
                    $inner->where('is_pickup_delivery', true)
                        ->where(function ($pickup): void {
                            $pickup->whereNull('courier_status')
                                ->orWhere('courier_status', '!=', 'delivered');
                        });
                });
            });
        } elseif ($statusScope === 'completed') {
            $query->where(function ($q): void {
                $q->where(function ($inner): void {
                    $inner->where('is_pickup_delivery', false)
                        ->where('laundry_status', 'completed');
                })->orWhere(function ($inner): void {
                    $inner->where('is_pickup_delivery', true)
                        ->where('courier_status', 'delivered');
                });
            });
        }

        if (! empty($validated['q'])) {
            $search = trim((string) $validated['q']);
            $phoneDigits = preg_replace('/\D+/', '', $search) ?? '';
            $phoneCandidates = [];

            if ($phoneDigits !== '') {
                $phoneCandidates[] = $phoneDigits;

                if (str_starts_with($phoneDigits, '0')) {
                    $phoneCandidates[] = '62'.ltrim(substr($phoneDigits, 1), '0');
                } elseif (str_starts_with($phoneDigits, '8')) {
                    $phoneCandidates[] = '62'.$phoneDigits;
                }
            }

            $query->where(function ($q) use ($search, $phoneCandidates): void {
                $q->where('order_code', 'like', "%{$search}%")
                    ->orWhere('invoice_no', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($qc) use ($search, $phoneCandidates): void {
                        $qc->where('name', 'like', "%{$search}%");

                        foreach (array_unique($phoneCandidates) as $candidate) {
                            $qc->orWhere('phone_normalized', 'like', "%{$candidate}%");
                        }
                    });
            });
        }

        $requestedTimezone = $validated['timezone'] ?? config('app.timezone', 'UTC');
        $appTimezone = config('app.timezone', 'UTC');

        if (! empty($validated['date'])) {
            $requestedDate = (string) $validated['date'];

            $startOfDay = CarbonImmutable::createFromFormat('Y-m-d', $requestedDate, $requestedTimezone)->startOfDay();
            $endOfDay = $startOfDay->endOfDay();

            $query->whereBetween('created_at', [
                $startOfDay->setTimezone($appTimezone),
                $endOfDay->setTimezone($appTimezone),
            ]);
        } elseif (! empty($validated['date_from']) || ! empty($validated['date_to'])) {
            $startToken = (string) ($validated['date_from'] ?? $validated['date_to']);
            $endToken = (string) ($validated['date_to'] ?? $validated['date_from']);

            $startOfDay = CarbonImmutable::createFromFormat('Y-m-d', $startToken, $requestedTimezone)->startOfDay();
            $endOfDay = CarbonImmutable::createFromFormat('Y-m-d', $endToken, $requestedTimezone)->endOfDay();

            if ($startOfDay->greaterThan($endOfDay)) {
                [$startOfDay, $endOfDay] = [$endOfDay->startOfDay(), $startOfDay->endOfDay()];
            }

            $query->whereBetween('created_at', [
                $startOfDay->setTimezone($appTimezone),
                $endOfDay->setTimezone($appTimezone),
            ]);
        }

        $limit = $validated['limit'] ?? 30;

        return response()->json([
            'data' => $query->limit($limit)->get(),
        ]);
    }

    public function show(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureOrderAccess($user, $order);

        return response()->json([
            'data' => $this->serializeOrderDetailPayload($order),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');
        $actorUserId = $user->id;

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
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
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'uuid'],
            'items.*.qty' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.weight_kg' => ['nullable', 'numeric', 'min:0.01'],
        ]);

        $outletId = $validated['outlet_id'];
        $tenantId = $user->tenant_id;
        $isPickup = (bool) ($validated['is_pickup_delivery'] ?? false);
        $shippingFee = (int) ($validated['shipping_fee_amount'] ?? 0);
        $discount = (int) ($validated['discount_amount'] ?? 0);

        if (Order::query()->where('tenant_id', $tenantId)->where('order_code', $validated['order_code'] ?? '')->exists()) {
            throw ValidationException::withMessages([
                'order_code' => ['The order_code has already been used in this tenant.'],
            ]);
        }

        try {
            $order = DB::transaction(function () use ($validated, $tenantId, $outletId, $isPickup, $shippingFee, $discount, $actorUserId, $sourceChannel): Order {
                $this->quotaService->consumeOrderSlot($tenantId);

                $phone = $this->normalizePhone($validated['customer']['phone']);

                if (! $phone) {
                    throw ValidationException::withMessages([
                        'customer.phone' => ['Invalid phone number format.'],
                    ]);
                }

                $customer = Customer::query()->updateOrCreate(
                    ['tenant_id' => $tenantId, 'phone_normalized' => $phone],
                    [
                        'name' => $validated['customer']['name'],
                        'notes' => $validated['customer']['notes'] ?? null,
                    ]
                );

                $order = Order::query()->create([
                    'tenant_id' => $tenantId,
                    'outlet_id' => $outletId,
                    'customer_id' => $customer->id,
                    'invoice_no' => $validated['invoice_no'] ?? null,
                    'order_code' => $validated['order_code'] ?? $this->generateOrderCode(),
                    'is_pickup_delivery' => $isPickup,
                    'laundry_status' => 'received',
                    'courier_status' => $isPickup ? 'pickup_pending' : null,
                    'shipping_fee_amount' => $shippingFee,
                    'discount_amount' => $discount,
                    'total_amount' => 0,
                    'paid_amount' => 0,
                    'due_amount' => 0,
                    'pickup' => $validated['pickup'] ?? null,
                    'delivery' => $validated['delivery'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                    'created_by' => $actorUserId,
                    'updated_by' => $actorUserId,
                    'source_channel' => $sourceChannel,
                ]);

                $subTotal = 0;
                $items = $validated['items'];

                foreach ($items as $item) {
                    $service = Service::query()
                        ->where('id', $item['service_id'])
                        ->where('tenant_id', $tenantId)
                        ->where('active', true)
                        ->first();

                    if (! $service) {
                        throw ValidationException::withMessages([
                            'items' => ["Service {$item['service_id']} is invalid for this tenant."],
                        ]);
                    }

                    $outletService = OutletService::query()
                        ->where('outlet_id', $outletId)
                        ->where('service_id', $service->id)
                        ->where('active', true)
                        ->first();

                    $unitPrice = (int) ($outletService?->price_override_amount ?? $service->base_price_amount);

                    $qty = isset($item['qty']) ? (float) $item['qty'] : null;
                    $weight = isset($item['weight_kg']) ? (float) $item['weight_kg'] : null;

                    if ($service->unit_type === 'kg' && ! $weight) {
                        throw ValidationException::withMessages([
                            'items' => ['weight_kg is required for unit_type kg.'],
                        ]);
                    }

                    if ($service->unit_type === 'pcs' && ! $qty) {
                        throw ValidationException::withMessages([
                            'items' => ['qty is required for unit_type pcs.'],
                        ]);
                    }

                    $metric = $service->unit_type === 'kg' ? (float) $weight : (float) $qty;
                    $lineSubTotal = (int) round($metric * $unitPrice);
                    $subTotal += $lineSubTotal;

                    OrderItem::query()->create([
                        'order_id' => $order->id,
                        'service_id' => $service->id,
                        'service_name_snapshot' => $service->name,
                        'unit_type_snapshot' => $service->unit_type,
                        'qty' => $qty,
                        'weight_kg' => $weight,
                        'unit_price_amount' => $unitPrice,
                        'subtotal_amount' => $lineSubTotal,
                    ]);
                }

                $total = max($subTotal + $shippingFee - $discount, 0);

                $order->forceFill([
                    'total_amount' => $total,
                    'paid_amount' => 0,
                    'due_amount' => $total,
                    'updated_by' => $actorUserId,
                    'source_channel' => $sourceChannel,
                ])->save();

                return $order;
            });
        } catch (TenantWriteAccessException $e) {
            return response()->json([
                'reason_code' => 'SUBSCRIPTION_READ_ONLY',
                'message' => 'Tenant subscription is not active for write operations.',
                'subscription_state' => $e->subscriptionState,
                'write_access_mode' => $e->writeAccessMode,
            ], 423);
        } catch (QuotaExceededException $e) {
            return response()->json([
                'reason_code' => 'QUOTA_EXCEEDED',
                'message' => 'Order quota for the current period has been reached.',
                'period' => $e->period,
                'orders_limit' => $e->ordersLimit,
                'orders_used' => $e->ordersUsed,
            ], 422);
        }

        $this->waDispatchService->enqueueOrderEvent($order, 'WA_PICKUP_CONFIRM', metadata: [
            'event' => 'order_created',
            'source' => 'api',
            'actor_user_id' => $user->id,
            'source_channel' => $sourceChannel,
        ]);

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_CREATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'order_code' => $order->order_code,
                'invoice_no' => $order->invoice_no,
                'total_amount' => $order->total_amount,
                'is_pickup_delivery' => $order->is_pickup_delivery,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $order->load(['customer:id,name,phone_normalized', 'items']),
        ], 201);
    }

    public function update(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');
        $actorUserId = $user->id;

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
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
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'uuid'],
            'items.*.qty' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.weight_kg' => ['nullable', 'numeric', 'min:0.01'],
        ]);

        if ($validated['outlet_id'] !== $order->outlet_id) {
            throw ValidationException::withMessages([
                'outlet_id' => ['Pesanan hanya bisa diedit dari outlet yang sama.'],
            ]);
        }

        if ((! $order->is_pickup_delivery && $order->laundry_status === 'completed')
            || ($order->is_pickup_delivery && $order->courier_status === 'delivered')) {
            throw ValidationException::withMessages([
                'order' => ['Pesanan yang sudah selesai tidak bisa diedit lagi.'],
            ]);
        }

        $tenantId = $user->tenant_id;
        $isPickup = (bool) ($validated['is_pickup_delivery'] ?? false);
        $shippingFee = (int) ($validated['shipping_fee_amount'] ?? 0);
        $discount = (int) ($validated['discount_amount'] ?? 0);

        $updatedOrder = DB::transaction(function () use ($validated, $tenantId, $order, $isPickup, $shippingFee, $discount, $actorUserId, $sourceChannel): Order {
            $phone = $this->normalizePhone($validated['customer']['phone']);

            if (! $phone) {
                throw ValidationException::withMessages([
                    'customer.phone' => ['Invalid phone number format.'],
                ]);
            }

            $customer = Customer::query()->updateOrCreate(
                ['tenant_id' => $tenantId, 'phone_normalized' => $phone],
                [
                    'name' => $validated['customer']['name'],
                    'notes' => $validated['customer']['notes'] ?? null,
                ]
            );

            $subTotal = 0;
            $lineItems = [];

            foreach ($validated['items'] as $item) {
                $service = Service::query()
                    ->where('id', $item['service_id'])
                    ->where('tenant_id', $tenantId)
                    ->where('active', true)
                    ->first();

                if (! $service) {
                    throw ValidationException::withMessages([
                        'items' => ["Service {$item['service_id']} is invalid for this tenant."],
                    ]);
                }

                $outletService = OutletService::query()
                    ->where('outlet_id', $order->outlet_id)
                    ->where('service_id', $service->id)
                    ->where('active', true)
                    ->first();

                $unitPrice = (int) ($outletService?->price_override_amount ?? $service->base_price_amount);

                $qty = isset($item['qty']) ? (float) $item['qty'] : null;
                $weight = isset($item['weight_kg']) ? (float) $item['weight_kg'] : null;

                if ($service->unit_type === 'kg' && ! $weight) {
                    throw ValidationException::withMessages([
                        'items' => ['weight_kg is required for unit_type kg.'],
                    ]);
                }

                if ($service->unit_type === 'pcs' && ! $qty) {
                    throw ValidationException::withMessages([
                        'items' => ['qty is required for unit_type pcs.'],
                    ]);
                }

                $metric = $service->unit_type === 'kg' ? (float) $weight : (float) $qty;
                $lineSubTotal = (int) round($metric * $unitPrice);
                $subTotal += $lineSubTotal;

                $lineItems[] = [
                    'service_id' => $service->id,
                    'service_name_snapshot' => $service->name,
                    'unit_type_snapshot' => $service->unit_type,
                    'qty' => $qty,
                    'weight_kg' => $weight,
                    'unit_price_amount' => $unitPrice,
                    'subtotal_amount' => $lineSubTotal,
                ];
            }

            $total = max($subTotal + $shippingFee - $discount, 0);
            $paidAmount = (int) $order->paid_amount;

            if ($total < $paidAmount) {
                throw ValidationException::withMessages([
                    'discount_amount' => ['Total pesanan tidak boleh lebih kecil dari pembayaran yang sudah tercatat.'],
                ]);
            }

            OrderItem::query()->where('order_id', $order->id)->delete();

            foreach ($lineItems as $lineItem) {
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    ...$lineItem,
                ]);
            }

            $resolvedPickup = $isPickup ? ($validated['pickup'] ?? $order->pickup) : null;
            $resolvedDelivery = $isPickup ? ($validated['delivery'] ?? $order->delivery) : null;

            $order->forceFill([
                'customer_id' => $customer->id,
                'is_pickup_delivery' => $isPickup,
                'courier_status' => $this->resolveEditedCourierStatus($order, $isPickup),
                'courier_user_id' => $isPickup ? $order->courier_user_id : null,
                'shipping_fee_amount' => $shippingFee,
                'discount_amount' => $discount,
                'total_amount' => $total,
                'due_amount' => max($total - $paidAmount, 0),
                'pickup' => $resolvedPickup,
                'delivery' => $resolvedDelivery,
                'notes' => $validated['notes'] ?? null,
                'updated_by' => $actorUserId,
                'source_channel' => $sourceChannel,
            ])->save();

            return $order;
        });

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $updatedOrder->outlet_id,
            entityType: 'order',
            entityId: $updatedOrder->id,
            metadata: [
                'order_code' => $updatedOrder->order_code,
                'total_amount' => $updatedOrder->total_amount,
                'is_pickup_delivery' => $updatedOrder->is_pickup_delivery,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeOrderDetailPayload($updatedOrder),
        ]);
    }

    public function addPayment(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');
        $actorUserId = $user->id;

        $validated = $request->validate([
            'amount' => ['required', 'integer', 'min:1'],
            'method' => ['required', 'string', 'max:30'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        $payment = DB::transaction(function () use ($validated, $order, $actorUserId, $sourceChannel): Payment {
            $payment = Payment::query()->create([
                'order_id' => $order->id,
                'amount' => (int) $validated['amount'],
                'method' => $validated['method'],
                'paid_at' => $validated['paid_at'] ?? now(),
                'notes' => $validated['notes'] ?? null,
                'created_by' => $actorUserId,
                'updated_by' => $actorUserId,
                'source_channel' => $sourceChannel,
            ]);

            $paidAmount = (int) Payment::query()->where('order_id', $order->id)->sum('amount');
            $dueAmount = max($order->total_amount - $paidAmount, 0);

            $order->forceFill([
                'paid_amount' => $paidAmount,
                'due_amount' => $dueAmount,
                'updated_by' => $actorUserId,
                'source_channel' => $sourceChannel,
            ])->save();

            return $payment;
        });

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PAYMENT_ADDED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'payment',
            entityId: $payment->id,
            metadata: [
                'order_id' => $order->id,
                'amount' => $payment->amount,
                'method' => $payment->method,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $payment,
            'order' => $order->fresh(['payments']),
        ], 201);
    }

    public function createQrisIntent(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);

        $validated = $request->validate([
            'amount' => ['nullable', 'integer', 'min:1'],
        ]);

        $freshOrder = $order->fresh();
        if (! $freshOrder) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Order not found.',
            ], 404);
        }

        if ((int) $freshOrder->due_amount <= 0) {
            return response()->json([
                'reason_code' => 'PAYMENT_ALREADY_SETTLED',
                'message' => 'Order already paid. QRIS intent is not required.',
            ], 422);
        }

        $amount = (int) ($validated['amount'] ?? $freshOrder->due_amount);

        if ($amount > (int) $freshOrder->due_amount) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'QRIS amount exceeds current due amount.',
            ], 422);
        }

        try {
            $intent = $this->orderPaymentGatewayService->createQrisIntent($freshOrder, $amount, $user);
        } catch (\Throwable $error) {
            report($error);

            return response()->json([
                'reason_code' => 'GATEWAY_REQUEST_FAILED',
                'message' => 'Failed to create QRIS payment intent.',
            ], 422);
        }

        return response()->json([
            'data' => [
                'order' => [
                    'id' => $freshOrder->id,
                    'order_code' => $freshOrder->order_code,
                    'total_amount' => (int) $freshOrder->total_amount,
                    'paid_amount' => (int) $freshOrder->paid_amount,
                    'due_amount' => (int) $freshOrder->due_amount,
                ],
                'intent' => $this->serializeOrderPaymentIntent($intent),
            ],
        ], 201);
    }

    public function qrisPaymentStatus(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);
        $this->ensureOrderAccess($user, $order);

        $latestIntent = OrderPaymentIntent::query()
            ->where('order_id', $order->id)
            ->latest('created_at')
            ->first();

        $latestEvent = OrderPaymentEvent::query()
            ->where('order_id', $order->id)
            ->latest('received_at')
            ->first();

        $events = OrderPaymentEvent::query()
            ->where('order_id', $order->id)
            ->latest('received_at')
            ->limit(10)
            ->get();

        return response()->json([
            'data' => [
                'order' => [
                    'id' => $order->id,
                    'order_code' => $order->order_code,
                    'total_amount' => (int) $order->total_amount,
                    'paid_amount' => (int) $order->paid_amount,
                    'due_amount' => (int) $order->due_amount,
                ],
                'latest_intent' => $latestIntent ? $this->serializeOrderPaymentIntent($latestIntent) : null,
                'latest_event' => $latestEvent ? $this->serializeOrderPaymentEvent($latestEvent) : null,
                'events' => $events->map(fn (OrderPaymentEvent $event): array => $this->serializeOrderPaymentEvent($event))->values(),
            ],
        ]);
    }

    public function updateLaundryStatus(Request $request, Order $order, OrderStatusTransitionValidator $validator): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'worker']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');

        $validated = $request->validate([
            'status' => ['required', 'string', 'max:32'],
        ]);

        $result = $validator->validateLaundry($order->laundry_status, $validated['status']);

        if (! $result['ok']) {
            return response()->json([
                'reason_code' => $result['reason_code'],
                'message' => $result['message'],
            ], 422);
        }

        if ($validated['status'] === 'completed' && (int) $order->due_amount > 0) {
            return response()->json([
                'reason_code' => 'PAYMENT_REQUIRED',
                'message' => 'Tagihan pesanan belum lunas. Lunasi dulu sebelum menyelesaikan pesanan.',
            ], 422);
        }

        $previousStatus = $order->laundry_status;
        $order->forceFill([
            'laundry_status' => $validated['status'],
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        if ($validated['status'] === 'ready') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_LAUNDRY_READY', metadata: [
                'event' => 'laundry_ready',
                'source' => 'api',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        if ($validated['status'] === 'completed' && ! $order->is_pickup_delivery) {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_ORDER_DONE', metadata: [
                'event' => 'order_done',
                'source' => 'api',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_LAUNDRY_STATUS_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'from' => $previousStatus,
                'to' => $validated['status'],
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $order->fresh(),
        ]);
    }

    public function updateCourierStatus(Request $request, Order $order, OrderStatusTransitionValidator $validator): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'courier']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');

        if (! $order->is_pickup_delivery) {
            return response()->json([
                'reason_code' => 'INVALID_TRANSITION',
                'message' => 'Courier status is only available for pickup-delivery orders.',
            ], 422);
        }

        $validated = $request->validate([
            'status' => ['required', 'string', 'max:32'],
        ]);

        $current = $order->courier_status ?? 'pickup_pending';
        $next = $validated['status'];
        $result = $validator->validateCourier($current, $next);

        if (! $result['ok']) {
            return response()->json([
                'reason_code' => $result['reason_code'],
                'message' => $result['message'],
            ], 422);
        }

        if ($next === 'delivery_pending' && ! in_array($order->laundry_status, ['ready', 'completed'], true)) {
            return response()->json([
                'reason_code' => 'INVALID_TRANSITION',
                'message' => 'laundry_status must be ready before setting delivery_pending.',
            ], 422);
        }

        if ($next === 'delivered' && (int) $order->due_amount > 0) {
            return response()->json([
                'reason_code' => 'PAYMENT_REQUIRED',
                'message' => 'Tagihan pesanan belum lunas. Lunasi dulu sebelum menyelesaikan pesanan.',
            ], 422);
        }

        $previousStatus = $current;
        $order->forceFill([
            'courier_status' => $next,
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        if ($next === 'pickup_on_the_way') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_PICKUP_OTW', metadata: [
                'event' => 'courier_pickup_otw',
                'source' => 'api',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        if ($next === 'delivery_on_the_way') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_DELIVERY_OTW', metadata: [
                'event' => 'courier_delivery_otw',
                'source' => 'api',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        if ($next === 'delivered') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_ORDER_DONE', metadata: [
                'event' => 'order_done',
                'source' => 'api',
                'actor_user_id' => $user->id,
                'source_channel' => $sourceChannel,
            ]);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_COURIER_STATUS_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'from' => $previousStatus,
                'to' => $next,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $order->fresh(),
        ]);
    }

    public function assignCourier(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');

        if (! $order->is_pickup_delivery) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Courier can only be assigned for pickup-delivery orders.',
            ], 422);
        }

        $validated = $request->validate([
            'courier_user_id' => ['required', 'integer'],
        ]);

        $courier = User::query()
            ->with('roles:id,key')
            ->where('id', $validated['courier_user_id'])
            ->where('tenant_id', $user->tenant_id)
            ->first();

        if (! $courier || ! $courier->hasRole('courier')) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Assigned user must be an active courier in the same tenant.',
            ], 422);
        }

        $order->forceFill([
            'courier_user_id' => $courier->id,
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_COURIER_ASSIGNED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'courier_user_id' => $courier->id,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $order->fresh(['courier:id,name,phone']),
        ]);
    }

    public function updateSchedule(Request $request, Order $order): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);
        $this->ensureOrderAccess($user, $order);
        $this->ensureOperationalWriteAccess($user->tenant_id);
        $sourceChannel = $this->resolveSourceChannel($request, 'web');

        if ($user->hasRole('cashier') && in_array((string) $order->courier_status, ['pickup_on_the_way', 'picked_up', 'at_outlet', 'delivery_pending', 'delivery_on_the_way', 'delivered'], true)) {
            return response()->json([
                'reason_code' => 'SCHEDULE_LOCKED',
                'message' => 'Cashier can only edit schedule before pickup_on_the_way.',
            ], 422);
        }

        $validated = $request->validate([
            'shipping_fee_amount' => ['nullable', 'integer', 'min:0'],
            'pickup' => ['nullable', 'array'],
            'delivery' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
        ]);

        $newShippingFee = array_key_exists('shipping_fee_amount', $validated)
            ? (int) $validated['shipping_fee_amount']
            : $order->shipping_fee_amount;

        $newTotal = max(
            ($order->total_amount - $order->shipping_fee_amount) + $newShippingFee,
            0
        );

        $newDue = max($newTotal - $order->paid_amount, 0);

        $order->forceFill([
            'shipping_fee_amount' => $newShippingFee,
            'pickup' => $validated['pickup'] ?? $order->pickup,
            'delivery' => $validated['delivery'] ?? $order->delivery,
            'notes' => $validated['notes'] ?? $order->notes,
            'total_amount' => $newTotal,
            'due_amount' => $newDue,
            'updated_by' => $user->id,
            'source_channel' => $sourceChannel,
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_SCHEDULE_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'shipping_fee_amount' => $newShippingFee,
                'total_amount' => $newTotal,
                'due_amount' => $newDue,
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $order->fresh(),
        ]);
    }

    private function ensureOrderAccess(User $user, Order $order): void
    {
        if ($order->tenant_id !== $user->tenant_id) {
            abort(response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested order.',
            ], 403));
        }

        $isOwner = $user->roles()->where('key', 'owner')->exists();

        if ($isOwner) {
            return;
        }

        $hasOutlet = DB::table('user_outlets')
            ->where('user_id', $user->id)
            ->where('outlet_id', $order->outlet_id)
            ->exists();

        if (! $hasOutlet) {
            abort(response()->json([
                'reason_code' => 'OUTLET_ACCESS_DENIED',
                'message' => 'You do not have access to the requested order.',
            ], 403));
        }
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

        abort(response()->json([
            'reason_code' => 'ROLE_ACCESS_DENIED',
            'message' => 'You are not allowed to perform this action.',
        ], 403));
    }

    private function ensureOperationalWriteAccess(?string $tenantId): void
    {
        if (! is_string($tenantId) || $tenantId === '') {
            return;
        }

        try {
            $this->quotaService->ensureTenantWriteAccess($tenantId);
        } catch (TenantWriteAccessException $e) {
            abort(response()->json([
                'reason_code' => 'SUBSCRIPTION_READ_ONLY',
                'message' => 'Tenant subscription is not active for write operations.',
                'subscription_state' => $e->subscriptionState,
                'write_access_mode' => $e->writeAccessMode,
            ], 423));
        }
    }

    private function resolveSourceChannel(Request $request, string $fallback = 'web'): string
    {
        $raw = strtolower((string) $request->header('X-Source-Channel', $fallback));

        return in_array($raw, ['mobile', 'web', 'system'], true) ? $raw : $fallback;
    }

    private function normalizePhone(string $phone): ?string
    {
        $trimmed = trim($phone);
        $digits = preg_replace('/\D+/', '', $trimmed) ?? '';

        if ($digits === '') {
            return null;
        }

        if (str_starts_with($trimmed, '+')) {
            return $this->isValidInternationalPhone($digits) ? $digits : null;
        }

        if (str_starts_with($digits, '00')) {
            $international = substr($digits, 2);

            return $this->isValidInternationalPhone($international) ? $international : null;
        }

        if (str_starts_with($digits, '0')) {
            $digits = '62'.ltrim(substr($digits, 1), '0');
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62'.$digits;
        }

        return $this->isValidInternationalPhone($digits) ? $digits : null;
    }

    private function isValidInternationalPhone(string $digits): bool
    {
        if (! preg_match('/^\d+$/', $digits)) {
            return false;
        }

        if (str_starts_with($digits, '0')) {
            return false;
        }

        $length = strlen($digits);

        return $length >= 8 && $length <= 16;
    }

    private function generateOrderCode(): string
    {
        return 'ORD-'.strtoupper(Str::random(8));
    }

    private function resolveEditedCourierStatus(Order $order, bool $isPickup): ?string
    {
        if (! $isPickup) {
            return null;
        }

        $currentStatus = (string) ($order->courier_status ?? '');
        if ($currentStatus !== '') {
            return $currentStatus;
        }

        return in_array((string) $order->laundry_status, ['ready', 'completed'], true)
            ? 'delivery_pending'
            : 'pickup_pending';
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeOrderDetailPayload(Order $order): array
    {
        $loadedOrder = $order->load([
            'customer:id,name,phone_normalized,notes',
            'items.service:id,duration_days,duration_hours,service_type',
            'items',
            'payments',
            'courier:id,name,phone',
        ]);

        $payload = $loadedOrder->toArray();
        $serviceIds = $loadedOrder->items
            ->pluck('service_id')
            ->filter(static fn ($value): bool => is_string($value) && $value !== '')
            ->unique()
            ->values();

        $maxDurationMinutes = null;
        if ($serviceIds->isNotEmpty()) {
            $maxDurationMinutes = Service::query()
                ->withTrashed()
                ->whereIn('id', $serviceIds->all())
                ->get(['duration_days', 'duration_hours'])
                ->map(static function (Service $service): int {
                    return ((int) ($service->duration_days ?? 0) * 24 * 60) + ((int) ($service->duration_hours ?? 0) * 60);
                })
                ->max();
        }

        $estimatedCompletionAt = null;
        $isLate = false;

        if ($maxDurationMinutes !== null && $maxDurationMinutes > 0 && $loadedOrder->created_at) {
            $estimatedCompletionAt = $loadedOrder->created_at->copy()->addMinutes((int) $maxDurationMinutes);
            $isLate = ! in_array((string) $loadedOrder->laundry_status, ['ready', 'completed'], true)
                && CarbonImmutable::now(config('app.timezone', 'UTC'))->greaterThan($estimatedCompletionAt);
        }

        $payload['estimated_completion_at'] = $estimatedCompletionAt?->toIso8601String();
        $payload['estimated_completion_duration_days'] = $maxDurationMinutes !== null ? intdiv((int) $maxDurationMinutes, 24 * 60) : null;
        $payload['estimated_completion_duration_hours'] = $maxDurationMinutes !== null ? intdiv(((int) $maxDurationMinutes) % (24 * 60), 60) : 0;
        $payload['estimated_completion_is_late'] = $isLate;

        return $payload;
    }

    private function serializeOrderPaymentIntent(OrderPaymentIntent $intent): array
    {
        return [
            'id' => $intent->id,
            'order_id' => $intent->order_id,
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

    private function serializeOrderPaymentEvent(OrderPaymentEvent $event): array
    {
        return [
            'id' => $event->id,
            'order_id' => $event->order_id,
            'provider' => $event->provider,
            'intent_id' => $event->intent_id,
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
}
