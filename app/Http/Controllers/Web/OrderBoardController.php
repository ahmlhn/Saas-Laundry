<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaExceededException;
use App\Domain\Billing\QuotaService;
use App\Domain\Billing\TenantWriteAccessException;
use App\Domain\Messaging\WaDispatchService;
use App\Domain\Orders\OrderExportService;
use App\Domain\Orders\OrderWorkflowService;
use App\Domain\Orders\OrderStatusTransitionValidator;
use App\Filament\Resources\Orders\OrderResource;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OutletService;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderBoardController extends Controller
{
    use EnsuresWebPanelAccess;

    public function __construct(
        private readonly OrderExportService $orderExport,
        private readonly OrderStatusTransitionValidator $statusValidator,
        private readonly QuotaService $quotaService,
        private readonly WaDispatchService $waDispatchService,
        private readonly AuditTrailService $auditTrail,
        private readonly OrderWorkflowService $orderWorkflow,
    ) {
    }

    public function export(Request $request, Tenant $tenant): StreamedResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'laundry_status' => ['nullable', 'string', 'max:32'],
            'courier_status' => ['nullable', 'string', 'max:32'],
            'search' => ['nullable', 'string', 'max:60'],
        ]);

        return $this->orderExport->streamCsv($tenant, $user, $validated);
    }

    public function store(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOperationalWriteAccess($tenant->id);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'order_code' => ['nullable', 'string', 'max:32'],
            'invoice_no' => ['nullable', 'string', 'max:50'],
            'requires_pickup' => ['nullable', 'boolean'],
            'requires_delivery' => ['nullable', 'boolean'],
            'is_pickup_delivery' => ['nullable', 'boolean'],
            'courier_user_id' => ['nullable', 'integer', 'min:1'],
            'shipping_fee_amount' => ['nullable', 'integer', 'min:0'],
            'discount_amount' => ['nullable', 'integer', 'min:0'],
            'notes' => ['nullable', 'string'],
            'pickup_address' => ['nullable', 'string', 'max:255'],
            'pickup_slot' => ['nullable', 'string', 'max:80'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_slot' => ['nullable', 'string', 'max:80'],
            'customer' => ['required', 'array'],
            'customer.name' => ['required', 'string', 'max:150'],
            'customer.phone' => ['required', 'string', 'max:30'],
            'customer.notes' => ['nullable', 'string'],
            'items' => ['nullable', 'array'],
            'items.*.service_id' => ['nullable', 'uuid'],
            'items.*.qty' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.weight_kg' => ['nullable', 'numeric', 'min:0.01'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);
        $outletId = (string) $validated['outlet_id'];

        if (! $ownerMode && ! in_array($outletId, $allowedOutletIds, true)) {
            throw ValidationException::withMessages([
                'order' => ['Outlet transaksi di luar scope outlet Anda.'],
            ]);
        }

        if (filled($validated['order_code'] ?? null)
            && Order::query()->where('tenant_id', $tenant->id)->where('order_code', (string) $validated['order_code'])->exists()) {
            throw ValidationException::withMessages([
                'order_code' => ['Kode order sudah digunakan pada tenant ini.'],
            ]);
        }

        if (filled($validated['invoice_no'] ?? null)
            && Order::query()->where('outlet_id', $outletId)->where('invoice_no', (string) $validated['invoice_no'])->exists()) {
            throw ValidationException::withMessages([
                'invoice_no' => ['Invoice outlet sudah digunakan.'],
            ]);
        }

        [$requiresPickup, $requiresDelivery, $isLegacyPickupMode] = $this->resolveCourierModeFlagsFromValidated($validated);
        $isCourierFlow = $requiresPickup || $requiresDelivery;
        $shippingFee = $isCourierFlow ? (int) ($validated['shipping_fee_amount'] ?? 0) : 0;
        $discount = (int) ($validated['discount_amount'] ?? 0);

        $pickupAddress = trim((string) ($validated['pickup_address'] ?? ''));
        $pickupSlot = trim((string) ($validated['pickup_slot'] ?? ''));
        $deliveryAddress = trim((string) ($validated['delivery_address'] ?? ''));
        // Delivery schedule is generated by system, not chosen manually on create flow.
        $deliverySlot = '';

        if ($requiresPickup && ! $isLegacyPickupMode && $pickupSlot === '') {
            throw ValidationException::withMessages([
                'pickup_slot' => ['Jadwal jemput wajib diisi untuk mode jemput.'],
            ]);
        }

        $pickup = $this->buildLogisticsPoint($requiresPickup, $pickupAddress, $pickupSlot);
        $delivery = $this->buildLogisticsPoint($requiresDelivery, $deliveryAddress, $deliverySlot);

        $items = $this->normalizeSubmittedItems($validated['items'] ?? []);

        if (! $requiresPickup && count($items) === 0) {
            throw ValidationException::withMessages([
                'items' => ['Item layanan wajib diisi untuk pesanan tanpa jemput.'],
            ]);
        }

        if ($requiresPickup && ! $isLegacyPickupMode && count($items) > 0) {
            throw ValidationException::withMessages([
                'items' => ['Untuk mode jemput, item layanan diinput setelah barang dijemput.'],
            ]);
        }

        $selectedCourier = null;
        $courierUserId = isset($validated['courier_user_id']) ? (int) $validated['courier_user_id'] : null;
        if ($courierUserId && ! $isCourierFlow) {
            throw ValidationException::withMessages([
                'courier_user_id' => ['Kurir hanya bisa ditetapkan untuk pesanan jemput atau antar.'],
            ]);
        }

        if ($courierUserId) {
            $courierQuery = User::query()
                ->with('roles:id,key')
                ->where('tenant_id', $tenant->id)
                ->where('status', 'active')
                ->where('id', $courierUserId);

            if (! $ownerMode) {
                $courierQuery->whereHas('outlets', fn ($q) => $q->where('outlets.id', $outletId));
            }

            $selectedCourier = $courierQuery->first();

            if (! $selectedCourier || ! $selectedCourier->hasRole('courier')) {
                throw ValidationException::withMessages([
                    'courier_user_id' => ['Kurir tidak valid atau tidak aktif untuk outlet ini.'],
                ]);
            }
        }

        try {
            $order = DB::transaction(function () use ($validated, $tenant, $user, $isCourierFlow, $requiresPickup, $requiresDelivery, $shippingFee, $discount, $outletId, $pickup, $delivery, $items, $selectedCourier): Order {
                $this->quotaService->consumeOrderSlot($tenant->id);

                $phone = $this->normalizePhone((string) $validated['customer']['phone']);

                if (! $phone) {
                    throw ValidationException::withMessages([
                        'customer.phone' => ['Format nomor telepon tidak valid.'],
                    ]);
                }

                $customer = Customer::query()->updateOrCreate(
                    ['tenant_id' => $tenant->id, 'phone_normalized' => $phone],
                    [
                        'name' => (string) $validated['customer']['name'],
                        'notes' => $validated['customer']['notes'] ?? null,
                    ],
                );

                $order = Order::query()->create([
                    'tenant_id' => $tenant->id,
                    'outlet_id' => $outletId,
                    'customer_id' => $customer->id,
                    'invoice_no' => filled($validated['invoice_no'] ?? null) ? (string) $validated['invoice_no'] : null,
                    'order_code' => filled($validated['order_code'] ?? null) ? (string) $validated['order_code'] : $this->generateOrderCode(),
                    'is_pickup_delivery' => $isCourierFlow,
                    'requires_pickup' => $requiresPickup,
                    'requires_delivery' => $requiresDelivery,
                    'laundry_status' => 'received',
                    'courier_status' => $this->resolveInitialCourierStatus($requiresPickup, $requiresDelivery),
                    'courier_user_id' => $selectedCourier?->id,
                    'shipping_fee_amount' => $shippingFee,
                    'discount_amount' => $discount,
                    'total_amount' => 0,
                    'paid_amount' => 0,
                    'due_amount' => 0,
                    'pickup' => $pickup,
                    'delivery' => $delivery,
                    'notes' => $validated['notes'] ?? null,
                    'created_by' => $user->id,
                    'updated_by' => $user->id,
                    'source_channel' => 'web',
                ]);

                $subTotal = 0;
                $maxDurationMinutes = 0;

                foreach ($items as $index => $item) {
                    $serviceId = (string) ($item['service_id'] ?? '');
                    $service = Service::query()
                        ->where('id', $serviceId)
                        ->where('tenant_id', $tenant->id)
                        ->where('active', true)
                        ->first();

                    if (! $service) {
                        throw ValidationException::withMessages([
                            "items.{$index}.service_id" => ['Layanan tidak valid untuk tenant ini.'],
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
                            "items.{$index}.weight_kg" => ['Berat wajib diisi untuk layanan berbasis kg.'],
                        ]);
                    }

                    if ($service->unit_type === 'pcs' && ! $qty) {
                        throw ValidationException::withMessages([
                            "items.{$index}.qty" => ['Qty wajib diisi untuk layanan berbasis pcs.'],
                        ]);
                    }

                    $metric = $service->unit_type === 'kg' ? (float) $weight : (float) $qty;
                    $lineSubtotal = (int) round($metric * $unitPrice);
                    $subTotal += $lineSubtotal;
                    $maxDurationMinutes = max($maxDurationMinutes, $this->resolveServiceDurationMinutes($service));

                    OrderItem::query()->create([
                        'order_id' => $order->id,
                        'service_id' => $service->id,
                        'service_name_snapshot' => $service->name,
                        'unit_type_snapshot' => $service->unit_type,
                        'qty' => $qty,
                        'weight_kg' => $weight,
                        'unit_price_amount' => $unitPrice,
                        'subtotal_amount' => $lineSubtotal,
                    ]);
                }

                $resolvedDelivery = $delivery;
                if ($requiresDelivery && count($items) > 0) {
                    $resolvedDelivery = $this->withAutoDeliverySchedule(
                        payload: $resolvedDelivery,
                        longestDurationMinutes: $maxDurationMinutes,
                        baseTime: now(),
                    );
                }

                $total = max($subTotal + $shippingFee - $discount, 0);

                $order->forceFill([
                    'total_amount' => $total,
                    'paid_amount' => 0,
                    'due_amount' => $total,
                    'delivery' => $resolvedDelivery,
                    'updated_by' => $user->id,
                    'source_channel' => 'web',
                ])->save();

                return $order;
            });
        } catch (QuotaExceededException $exception) {
            throw ValidationException::withMessages([
                'quota' => [sprintf(
                    'Kuota order periode %s habis (%d/%d).',
                    $exception->period,
                    $exception->ordersUsed,
                    $exception->ordersLimit,
                )],
            ]);
        }

        if ($order->requires_pickup) {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_PICKUP_CONFIRM', metadata: [
                'event' => 'order_created',
                'source' => 'web',
                'actor_user_id' => $user->id,
                'source_channel' => 'web',
            ]);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_CREATED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'order_code' => $order->order_code,
                'invoice_no' => $order->invoice_no,
                'total_amount' => $order->total_amount,
                'is_pickup_delivery' => $order->is_pickup_delivery,
                'requires_pickup' => (bool) $order->requires_pickup,
                'requires_delivery' => (bool) $order->requires_delivery,
            ],
            channel: 'web',
            request: $request,
        );

        return $this->redirectToFilamentOrderView($order, 'Transaksi baru berhasil dibuat.');
    }

    public function receipt(Request $request, Tenant $tenant, string $order): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $orderRow = $this->findScopedOrder($user, $tenant, $order, [
            'customer:id,name,phone_normalized',
            'outlet:id,name,code,address,timezone',
            'items:id,order_id,service_name_snapshot,unit_type_snapshot,qty,weight_kg,unit_price_amount,subtotal_amount',
            'payments:id,order_id,amount,method,paid_at,notes',
        ]);
        $orderRow->setRelation('payments', $orderRow->payments->sortBy('paid_at')->values());

        return view('web.orders.receipt', [
            'tenant' => $tenant,
            'orderRow' => $orderRow,
            'itemSubTotal' => (int) $orderRow->items->sum('subtotal_amount'),
        ]);
    }

    public function updateLaundryStatus(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'laundry_status' => ['required', 'string', 'in:received,washing,drying,ironing,ready,completed'],
        ]);
        $orderRow = $this->findScopedOrder($user, $tenant, $order);
        $targetStatus = (string) $validated['laundry_status'];

        $result = $this->orderWorkflow->updateLaundryStatus(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            targetStatus: $targetStatus,
            request: $request,
            actionKey: 'single-laundry-update',
        );

        if (! $result['updated']) {
            throw ValidationException::withMessages([
                'laundry_status' => [$result['reason_label']],
            ]);
        }

        return $this->redirectToFilamentOrderView($orderRow, 'Status laundry berhasil diperbarui.');
    }

    public function updateCourierStatus(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'courier_status' => ['required', 'string', 'in:pickup_pending,pickup_on_the_way,picked_up,at_outlet,delivery_pending,delivery_on_the_way,delivered'],
        ]);
        $orderRow = $this->findScopedOrder($user, $tenant, $order);
        $targetStatus = (string) $validated['courier_status'];

        $result = $this->orderWorkflow->updateCourierStatus(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            targetStatus: $targetStatus,
            request: $request,
            actionKey: 'single-courier-update',
        );

        if (! $result['updated']) {
            throw ValidationException::withMessages([
                'courier_status' => [$result['reason_label']],
            ]);
        }

        return $this->redirectToFilamentOrderView($orderRow, 'Status kurir berhasil diperbarui.');
    }

    public function assignCourier(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'courier_user_id' => ['required', 'integer', 'min:1'],
        ]);
        $orderRow = $this->findScopedOrder($user, $tenant, $order);
        $courierUserId = (int) $validated['courier_user_id'];
        $targetCourier = $this->scopedCourierQuery($user, $tenant, (string) $orderRow->outlet_id)
            ->where('id', $courierUserId)
            ->first();

        $result = $this->orderWorkflow->assignCourier(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            targetCourier: $targetCourier,
            courierUserId: $courierUserId,
            request: $request,
            actionKey: 'single-courier-assign',
        );

        if (! $result['updated']) {
            throw ValidationException::withMessages([
                'courier_user_id' => [$result['reason_label']],
            ]);
        }

        return $this->redirectToFilamentOrderView($orderRow, 'Kurir berhasil ditetapkan ke pesanan.');
    }

    public function addPayment(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'amount' => ['nullable', 'integer', 'min:1'],
            'method' => ['required', 'string', 'max:30'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'quick_action' => ['nullable', 'string', 'in:full,half,fixed_10000'],
        ]);

        $orderRow = $this->findScopedOrder($user, $tenant, $order);
        $this->orderWorkflow->addPayment(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            validated: $validated,
            request: $request,
        );

        return $this->redirectToFilamentOrderView($orderRow, 'Pembayaran berhasil ditambahkan ke transaksi.');
    }

    public function bulkUpdate(Request $request, Tenant $tenant): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOperationalWriteAccess($tenant->id);

        $validated = $request->validate([
            'action' => ['required', 'string', 'in:mark-ready,mark-completed,courier-delivery-pending,courier-delivery-otw,courier-delivered,assign-courier'],
            'selected_ids' => ['required', 'string'],
            'courier_user_id' => ['nullable', 'integer', 'min:1', 'required_if:action,assign-courier'],
        ]);

        $selectedIds = collect(explode(',', (string) $validated['selected_ids']))
            ->map(fn (string $id): string => trim($id))
            ->filter()
            ->unique()
            ->values();

        if ($selectedIds->isEmpty()) {
            throw ValidationException::withMessages([
                'bulk' => ['Pilih minimal satu order untuk bulk action.'],
            ]);
        }

        if ($selectedIds->count() > 100) {
            throw ValidationException::withMessages([
                'bulk' => ['Maksimal 100 order per bulk action.'],
            ]);
        }

        if ($selectedIds->contains(fn (string $id): bool => ! Str::isUuid($id))) {
            throw ValidationException::withMessages([
                'bulk' => ['Format selected order ids tidak valid.'],
            ]);
        }

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);
        $allowedOutletLookup = collect($allowedOutletIds)
            ->mapWithKeys(fn (string $outletId): array => [$outletId => true])
            ->all();

        $actionConfig = match ($validated['action']) {
            'mark-ready' => ['type' => 'laundry', 'target' => 'ready'],
            'mark-completed' => ['type' => 'laundry', 'target' => 'completed'],
            'courier-delivery-pending' => ['type' => 'courier', 'target' => 'delivery_pending'],
            'courier-delivery-otw' => ['type' => 'courier', 'target' => 'delivery_on_the_way'],
            'courier-delivered' => ['type' => 'courier', 'target' => 'delivered'],
            'assign-courier' => ['type' => 'assign_courier', 'target' => 'courier_assigned'],
            default => null,
        };

        if (! is_array($actionConfig)) {
            throw ValidationException::withMessages([
                'bulk' => ['Action tidak dikenali.'],
            ]);
        }

        $targetStatus = (string) $actionConfig['target'];
        $courierUserId = array_key_exists('courier_user_id', $validated)
            ? (int) $validated['courier_user_id']
            : null;
        $targetCourier = null;

        if ($actionConfig['type'] === 'assign_courier' && is_int($courierUserId)) {
            $targetCourier = User::query()
                ->with('roles:id,key')
                ->where('tenant_id', $tenant->id)
                ->where('id', $courierUserId)
                ->first();
        }

        $ordersById = Order::query()
            ->where('tenant_id', $tenant->id)
            ->whereIn('id', $selectedIds->all())
            ->with('courier:id,name')
            ->get()
            ->keyBy('id');

        $hasOrderInScope = $selectedIds->contains(
            function (string $selectedId) use ($ordersById, $ownerMode, $allowedOutletLookup): bool {
                /** @var Order|null $order */
                $order = $ordersById->get($selectedId);

                if (! $order) {
                    return false;
                }

                if ($ownerMode) {
                    return true;
                }

                return isset($allowedOutletLookup[(string) $order->outlet_id]);
            },
        );

        if (! $hasOrderInScope) {
            throw ValidationException::withMessages([
                'bulk' => ['Tidak ada order valid dalam scope tenant/outlet Anda.'],
            ]);
        }

        $updated = 0;
        $skipped = 0;
        $rows = [];

        foreach ($selectedIds as $selectedId) {
            /** @var Order|null $order */
            $order = $ordersById->get($selectedId);

            if (! $order) {
                $skipped++;
                $rows[] = [
                    'order_id' => $selectedId,
                    'order_ref' => $selectedId,
                    'result' => 'skipped',
                    'reason_code' => 'NOT_FOUND',
                    'reason' => $this->bulkReasonLabel('NOT_FOUND'),
                    'from_status' => null,
                    'to_status' => $actionConfig['type'] === 'assign_courier'
                        ? $this->resolveCourierLabel($targetCourier, $courierUserId)
                        : $targetStatus,
                ];

                continue;
            }

            if (! $ownerMode && ! isset($allowedOutletLookup[(string) $order->outlet_id])) {
                $skipped++;
                $rows[] = [
                    'order_id' => $order->id,
                    'order_ref' => (string) ($order->invoice_no ?: $order->order_code),
                    'result' => 'skipped',
                    'reason_code' => 'OUT_OF_SCOPE',
                    'reason' => $this->bulkReasonLabel('OUT_OF_SCOPE'),
                    'from_status' => $actionConfig['type'] === 'laundry'
                        ? (string) $order->laundry_status
                        : ($actionConfig['type'] === 'courier'
                            ? (string) ($order->courier_status ?: $this->resolveInitialCourierStatus((bool) ($order->requires_pickup ?? false), (bool) ($order->requires_delivery ?? false)))
                            : $this->resolveCourierLabel($order->courier, $order->courier_user_id)),
                    'to_status' => $actionConfig['type'] === 'assign_courier'
                        ? $this->resolveCourierLabel($targetCourier, $courierUserId)
                        : $targetStatus,
                ];

                continue;
            }

            $transitionResult = match ($actionConfig['type']) {
                'laundry' => $this->applyLaundryTransition(
                    $order,
                    $user,
                    $tenant,
                    $request,
                    $targetStatus,
                    (string) $validated['action'],
                    true,
                ),
                'courier' => $this->applyCourierTransition(
                    $order,
                    $user,
                    $tenant,
                    $request,
                    $targetStatus,
                    (string) $validated['action'],
                    true,
                ),
                'assign_courier' => $this->applyCourierAssignment(
                    $order,
                    $user,
                    $tenant,
                    $request,
                    $targetCourier,
                    $courierUserId,
                    (string) $validated['action'],
                    true,
                ),
                default => [
                    'updated' => false,
                    'reason_code' => 'UNKNOWN_ACTION',
                    'reason_label' => $this->bulkReasonLabel('UNKNOWN_ACTION'),
                    'from' => '-',
                    'to' => '-',
                ],
            };

            if ($transitionResult['updated']) {
                $updated++;
            } else {
                $skipped++;
            }

            $rows[] = [
                'order_id' => $order->id,
                'order_ref' => (string) ($order->invoice_no ?: $order->order_code),
                'result' => $transitionResult['updated'] ? 'updated' : 'skipped',
                'reason_code' => $transitionResult['reason_code'],
                'reason' => $transitionResult['reason_label'],
                'from_status' => $transitionResult['from'],
                'to_status' => $transitionResult['to'],
            ];
        }

        return $this->redirectToFilamentOrderIndex(sprintf(
                'Bulk %s selesai: %d updated, %d skipped.',
                $validated['action'],
                $updated,
                $skipped,
            ))
            ->with('bulk_report', [
                'action' => (string) $validated['action'],
                'target_status' => $actionConfig['type'] === 'assign_courier'
                    ? $this->resolveCourierLabel($targetCourier, $courierUserId)
                    : $targetStatus,
                'updated' => $updated,
                'skipped' => $skipped,
                'total' => $selectedIds->count(),
                'rows' => $rows,
            ]);
    }

    /**
     * @return array{updated: bool, reason_code: string, reason_label: string, from: string, to: string}
     */
    private function applyLaundryTransition(
        Order $order,
        User $user,
        Tenant $tenant,
        Request $request,
        string $targetStatus,
        string $actionKey,
        bool $isBulkAction,
    ): array {
        $currentStatus = (string) $order->laundry_status;

        if ($currentStatus === $targetStatus) {
            return [
                'updated' => false,
                'reason_code' => 'UNCHANGED',
                'reason_label' => $this->bulkReasonLabel('UNCHANGED'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        $result = $this->statusValidator->validateLaundry($currentStatus, $targetStatus);

        if (! $result['ok']) {
            $reasonCode = (string) ($result['reason_code'] ?? 'INVALID_TRANSITION');

            return [
                'updated' => false,
                'reason_code' => $reasonCode,
                'reason_label' => $this->bulkReasonLabel($reasonCode),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus !== 'received' && ! OrderItem::query()->where('order_id', $order->id)->exists()) {
            return [
                'updated' => false,
                'reason_code' => 'ITEMS_REQUIRED',
                'reason_label' => $this->bulkReasonLabel('ITEMS_REQUIRED'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus === 'completed' && (int) $order->due_amount > 0) {
            return [
                'updated' => false,
                'reason_code' => 'PAYMENT_REQUIRED',
                'reason_label' => $this->bulkReasonLabel('PAYMENT_REQUIRED'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        $order->forceFill([
            'laundry_status' => $targetStatus,
            'updated_by' => $user->id,
            'source_channel' => 'web',
        ])->save();

        if ($targetStatus === 'ready') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_LAUNDRY_READY', metadata: [
                'event' => $isBulkAction ? 'laundry_ready_bulk' : 'laundry_ready_single',
                'source' => 'web',
                'actor_user_id' => $user->id,
                'bulk_action' => $isBulkAction,
            ]);
        }

        if ($targetStatus === 'completed' && ! $order->requires_delivery) {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_ORDER_DONE', metadata: [
                'event' => $isBulkAction ? 'order_done_bulk' : 'order_done_single',
                'source' => 'web',
                'actor_user_id' => $user->id,
                'bulk_action' => $isBulkAction,
            ]);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_LAUNDRY_STATUS_UPDATED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'from' => $currentStatus,
                'to' => $targetStatus,
                'bulk_action' => $isBulkAction,
                'bulk_action_key' => $actionKey,
            ],
            channel: 'web',
            request: $request,
        );

        return [
            'updated' => true,
            'reason_code' => 'UPDATED',
            'reason_label' => $this->bulkReasonLabel('UPDATED'),
            'from' => $currentStatus,
            'to' => $targetStatus,
        ];
    }

    /**
     * @return array{updated: bool, reason_code: string, reason_label: string, from: string, to: string}
     */
    private function applyCourierTransition(
        Order $order,
        User $user,
        Tenant $tenant,
        Request $request,
        string $targetStatus,
        string $actionKey,
        bool $isBulkAction,
    ): array {
        $requiresPickup = (bool) ($order->requires_pickup ?? false);
        $requiresDelivery = (bool) ($order->requires_delivery ?? false);
        $currentStatus = (string) ($order->courier_status ?: $this->resolveInitialCourierStatus($requiresPickup, $requiresDelivery));

        if (! $order->is_pickup_delivery) {
            return [
                'updated' => false,
                'reason_code' => 'NOT_PICKUP_DELIVERY',
                'reason_label' => $this->bulkReasonLabel('NOT_PICKUP_DELIVERY'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if (! $requiresPickup && in_array($targetStatus, ['pickup_pending', 'pickup_on_the_way', 'picked_up'], true)) {
            return [
                'updated' => false,
                'reason_code' => 'INVALID_TRANSITION',
                'reason_label' => 'Status pickup tidak tersedia untuk mode tanpa jemput.',
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($requiresPickup && ! $requiresDelivery && $targetStatus === 'at_outlet') {
            return [
                'updated' => false,
                'reason_code' => 'INVALID_TRANSITION',
                'reason_label' => 'Status di outlet tidak tersedia untuk mode jemput saja.',
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if (! $requiresDelivery && in_array($targetStatus, ['delivery_pending', 'delivery_on_the_way', 'delivered'], true)) {
            return [
                'updated' => false,
                'reason_code' => 'INVALID_TRANSITION',
                'reason_label' => 'Status delivery tidak tersedia untuk mode tanpa antar.',
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($currentStatus === $targetStatus) {
            return [
                'updated' => false,
                'reason_code' => 'UNCHANGED',
                'reason_label' => $this->bulkReasonLabel('UNCHANGED'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        $result = $this->statusValidator->validateCourier($currentStatus, $targetStatus);

        if (! $result['ok']) {
            $reasonCode = (string) ($result['reason_code'] ?? 'INVALID_TRANSITION');

            return [
                'updated' => false,
                'reason_code' => $reasonCode,
                'reason_label' => $this->bulkReasonLabel($reasonCode),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus === 'delivery_pending' && ! in_array((string) $order->laundry_status, ['ready', 'completed'], true)) {
            return [
                'updated' => false,
                'reason_code' => 'LAUNDRY_NOT_READY',
                'reason_label' => $this->bulkReasonLabel('LAUNDRY_NOT_READY'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus === 'delivered' && (int) $order->due_amount > 0) {
            return [
                'updated' => false,
                'reason_code' => 'PAYMENT_REQUIRED',
                'reason_label' => $this->bulkReasonLabel('PAYMENT_REQUIRED'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        $order->forceFill([
            'courier_status' => $targetStatus,
            'updated_by' => $user->id,
            'source_channel' => 'web',
        ])->save();

        if ($targetStatus === 'delivery_on_the_way') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_DELIVERY_OTW', metadata: [
                'event' => $isBulkAction ? 'delivery_otw_bulk' : 'delivery_otw_single',
                'source' => 'web',
                'actor_user_id' => $user->id,
                'bulk_action' => $isBulkAction,
            ]);
        }

        if ($targetStatus === 'delivered') {
            $this->waDispatchService->enqueueOrderEvent($order, 'WA_ORDER_DONE', metadata: [
                'event' => $isBulkAction ? 'order_done_bulk' : 'order_done_single',
                'source' => 'web',
                'actor_user_id' => $user->id,
                'bulk_action' => $isBulkAction,
            ]);
        }

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_COURIER_STATUS_UPDATED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'from' => $currentStatus,
                'to' => $targetStatus,
                'bulk_action' => $isBulkAction,
                'bulk_action_key' => $actionKey,
            ],
            channel: 'web',
            request: $request,
        );

        return [
            'updated' => true,
            'reason_code' => 'UPDATED',
            'reason_label' => $this->bulkReasonLabel('UPDATED'),
            'from' => $currentStatus,
            'to' => $targetStatus,
        ];
    }

    /**
     * @return array{updated: bool, reason_code: string, reason_label: string, from: string, to: string}
     */
    private function applyCourierAssignment(
        Order $order,
        User $user,
        Tenant $tenant,
        Request $request,
        ?User $targetCourier,
        ?int $courierUserId,
        string $actionKey,
        bool $isBulkAction,
    ): array {
        $currentCourierLabel = $this->resolveCourierLabel($order->courier, $order->courier_user_id);
        $targetCourierLabel = $this->resolveCourierLabel($targetCourier, $courierUserId);

        if (! $order->is_pickup_delivery) {
            return [
                'updated' => false,
                'reason_code' => 'NOT_PICKUP_DELIVERY',
                'reason_label' => $this->bulkReasonLabel('NOT_PICKUP_DELIVERY'),
                'from' => $currentCourierLabel,
                'to' => $targetCourierLabel,
            ];
        }

        if (! $targetCourier || ! $targetCourier->hasRole('courier') || (string) $targetCourier->status !== 'active') {
            return [
                'updated' => false,
                'reason_code' => 'COURIER_INVALID',
                'reason_label' => $this->bulkReasonLabel('COURIER_INVALID'),
                'from' => $currentCourierLabel,
                'to' => $targetCourierLabel,
            ];
        }

        if ((int) ($order->courier_user_id ?? 0) === (int) $targetCourier->id) {
            return [
                'updated' => false,
                'reason_code' => 'UNCHANGED',
                'reason_label' => $this->bulkReasonLabel('UNCHANGED'),
                'from' => $currentCourierLabel,
                'to' => $targetCourierLabel,
            ];
        }

        $previousCourierUserId = $order->courier_user_id;
        $order->forceFill([
            'courier_user_id' => $targetCourier->id,
            'updated_by' => $user->id,
            'source_channel' => 'web',
        ])->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::ORDER_COURIER_ASSIGNED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: $order->outlet_id,
            entityType: 'order',
            entityId: $order->id,
            metadata: [
                'from_courier_user_id' => $previousCourierUserId,
                'to_courier_user_id' => $targetCourier->id,
                'bulk_action' => $isBulkAction,
                'bulk_action_key' => $actionKey,
            ],
            channel: 'web',
            request: $request,
        );

        return [
            'updated' => true,
            'reason_code' => 'UPDATED',
            'reason_label' => $this->bulkReasonLabel('UPDATED'),
            'from' => $currentCourierLabel,
            'to' => $targetCourierLabel,
        ];
    }

    private function resolveCourierLabel(?User $courier, mixed $courierId): string
    {
        if ($courier && $courier->name) {
            return (string) $courier->name;
        }

        if (is_numeric($courierId) && (int) $courierId > 0) {
            return 'courier#'.(int) $courierId;
        }

        return '-';
    }

    private function bulkReasonLabel(string $reasonCode): string
    {
        return match ($reasonCode) {
            'UPDATED' => 'Status berhasil diperbarui.',
            'UNCHANGED' => 'Status target sama dengan status saat ini.',
            'STATUS_NOT_FORWARD' => 'Transisi status harus maju sesuai urutan.',
            'INVALID_TRANSITION' => 'Transisi status tidak valid.',
            'NOT_PICKUP_DELIVERY' => 'Order bukan tipe pickup-delivery.',
            'COURIER_INVALID' => 'Courier target tidak valid atau tidak aktif.',
            'LAUNDRY_NOT_READY' => 'Laundry belum ready/completed untuk masuk delivery pending.',
            'ITEMS_REQUIRED' => 'Item layanan belum diinput. Lanjutkan setelah timbang/input item.',
            'PAYMENT_REQUIRED' => 'Tagihan pesanan belum lunas. Lunasi dulu sebelum menyelesaikan pesanan.',
            'OUT_OF_SCOPE' => 'Order di luar scope tenant/outlet Anda.',
            'NOT_FOUND' => 'Order tidak ditemukan pada tenant ini.',
            'UNKNOWN_ACTION' => 'Action tidak dikenali.',
            default => 'Order dilewati oleh validasi.',
        };
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{0: bool, 1: bool, 2: bool}
     */
    private function resolveCourierModeFlagsFromValidated(array $validated): array
    {
        $explicitPickup = array_key_exists('requires_pickup', $validated);
        $explicitDelivery = array_key_exists('requires_delivery', $validated);
        $isLegacy = ! $explicitPickup && ! $explicitDelivery;

        if ($isLegacy) {
            $legacyPickupDelivery = (bool) ($validated['is_pickup_delivery'] ?? false);

            return [$legacyPickupDelivery, $legacyPickupDelivery, true];
        }

        return [
            (bool) ($validated['requires_pickup'] ?? false),
            (bool) ($validated['requires_delivery'] ?? false),
            false,
        ];
    }

    private function buildLogisticsPoint(bool $enabled, string $address, string $slot): ?array
    {
        if (! $enabled) {
            return null;
        }

        if ($address === '' && $slot === '') {
            return null;
        }

        return [
            'address_short' => $address !== '' ? $address : null,
            'slot' => $slot !== '' ? $slot : null,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rawItems
     * @return array<int, array{service_id: string, qty: float|null, weight_kg: float|null}>
     */
    private function normalizeSubmittedItems(array $rawItems): array
    {
        $rows = [];

        foreach ($rawItems as $index => $item) {
            $serviceId = trim((string) ($item['service_id'] ?? ''));
            $qtyRaw = $item['qty'] ?? null;
            $weightRaw = $item['weight_kg'] ?? null;
            $hasQty = $qtyRaw !== null && $qtyRaw !== '';
            $hasWeight = $weightRaw !== null && $weightRaw !== '';

            if ($serviceId === '') {
                if ($hasQty || $hasWeight) {
                    throw ValidationException::withMessages([
                        "items.{$index}.service_id" => ['Layanan wajib dipilih saat qty/berat diisi.'],
                    ]);
                }

                continue;
            }

            $rows[] = [
                'service_id' => $serviceId,
                'qty' => $hasQty ? (float) $qtyRaw : null,
                'weight_kg' => $hasWeight ? (float) $weightRaw : null,
            ];
        }

        return $rows;
    }

    private function resolveInitialCourierStatus(bool $requiresPickup, bool $requiresDelivery): ?string
    {
        if (! $requiresPickup && ! $requiresDelivery) {
            return null;
        }

        if ($requiresPickup) {
            return 'pickup_pending';
        }

        return 'at_outlet';
    }

    /**
     * @return array<int, string>
     */
    private function courierSteps(bool $requiresPickup, bool $requiresDelivery): array
    {
        if (! $requiresPickup && ! $requiresDelivery) {
            return [];
        }

        if ($requiresPickup && $requiresDelivery) {
            return ['pickup_pending', 'pickup_on_the_way', 'picked_up', 'delivery_pending', 'delivery_on_the_way', 'delivered'];
        }

        if ($requiresPickup) {
            return ['pickup_pending', 'pickup_on_the_way', 'picked_up'];
        }

        return ['at_outlet', 'delivery_pending', 'delivery_on_the_way', 'delivered'];
    }

    private function resolveServiceDurationMinutes(Service $service): int
    {
        $days = (int) ($service->duration_days ?? 0);
        $hours = (int) ($service->duration_hours ?? 0);

        return max(($days * 24 * 60) + ($hours * 60), 0);
    }

    private function withAutoDeliverySchedule(?array $payload, int $longestDurationMinutes, Carbon $baseTime): array
    {
        $minutes = max($longestDurationMinutes, 0);
        $scheduledAt = $baseTime->copy()->addMinutes($minutes);
        $next = is_array($payload) ? $payload : [];

        $next['slot'] = $scheduledAt->format('Y-m-d H:i');
        $next['slot_auto'] = true;
        $next['slot_generated_at'] = $baseTime->toIso8601String();
        $next['slot_generated_duration_minutes'] = $minutes;

        return $next;
    }

    private function ensureOperationalWriteAccess(string $tenantId): void
    {
        try {
            $this->quotaService->ensureTenantWriteAccess($tenantId);
        } catch (TenantWriteAccessException $exception) {
            throw ValidationException::withMessages([
                'subscription' => [sprintf(
                    'Operasi write diblokir: subscription_state=%s, write_access_mode=%s.',
                    (string) ($exception->subscriptionState ?? 'unknown'),
                    (string) ($exception->writeAccessMode ?? 'unknown'),
                )],
            ]);
        }
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

    protected function scopedOrdersQuery(User $user, Tenant $tenant, array $with = []): Builder
    {
        $query = Order::query()
            ->where('tenant_id', $tenant->id);

        if ($with !== []) {
            $query->with($with);
        }

        if (! $this->isOwner($user)) {
            $query->whereIn('outlet_id', $this->allowedOutletIds($user, $tenant->id));
        }

        return $query;
    }

    protected function findScopedOrder(User $user, Tenant $tenant, string $orderId, array $with = []): Order
    {
        return $this->scopedOrdersQuery($user, $tenant, $with)
            ->where('id', $orderId)
            ->firstOrFail();
    }

    protected function scopedCourierQuery(User $user, Tenant $tenant, ?string $outletId = null): Builder
    {
        $query = User::query()
            ->with('roles:id,key')
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active');

        if (! $this->isOwner($user) && filled($outletId)) {
            $query->whereHas('outlets', fn (Builder $builder) => $builder->where('outlets.id', $outletId));
        }

        return $query;
    }

    private function redirectToFilamentOrderView(Order $order, string $status): RedirectResponse
    {
        return redirect(OrderResource::getUrl(name: 'view', parameters: ['record' => $order], panel: 'tenant'))
            ->with('status', $status);
    }

    private function redirectToFilamentOrderIndex(string $status): RedirectResponse
    {
        return redirect(OrderResource::getUrl(name: 'index', panel: 'tenant'))
            ->with('status', $status);
    }
}
