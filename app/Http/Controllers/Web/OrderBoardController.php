<?php

namespace App\Http\Controllers\Web;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaExceededException;
use App\Domain\Billing\QuotaService;
use App\Domain\Billing\TenantWriteAccessException;
use App\Domain\Messaging\WaDispatchService;
use App\Domain\Orders\OrderStatusTransitionValidator;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Web\Concerns\EnsuresWebPanelAccess;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Payment;
use App\Models\Service;
use App\Models\Tenant;
use App\Models\User;
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
        private readonly OrderStatusTransitionValidator $statusValidator,
        private readonly QuotaService $quotaService,
        private readonly WaDispatchService $waDispatchService,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function index(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $validated = $request->validate([
            'outlet_id' => ['nullable', 'uuid'],
            'laundry_status' => ['nullable', 'string', 'max:32'],
            'courier_status' => ['nullable', 'string', 'max:32'],
            'search' => ['nullable', 'string', 'max:60'],
            'limit' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $outletsQuery = Outlet::query()->where('tenant_id', $tenant->id)->orderBy('name');

        if (! $ownerMode) {
            $outletsQuery->whereIn('id', $allowedOutletIds);
        }

        $outlets = $outletsQuery->get(['id', 'name', 'code']);

        $couriersQuery = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->whereHas('roles', fn ($q) => $q->where('key', 'courier'))
            ->orderBy('name');

        if (! $ownerMode) {
            $couriersQuery->whereHas('outlets', fn ($q) => $q->whereIn('outlets.id', $allowedOutletIds));
        }

        $couriers = $couriersQuery->get(['id', 'name']);

        $query = Order::query()
            ->where('tenant_id', $tenant->id)
            ->with(['customer:id,name,phone_normalized', 'outlet:id,name,code', 'courier:id,name'])
            ->latest('created_at');

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        if (! empty($validated['outlet_id'])) {
            $query->where('outlet_id', $validated['outlet_id']);
        }

        if (! empty($validated['laundry_status'])) {
            $query->where('laundry_status', $validated['laundry_status']);
        }

        if (! empty($validated['courier_status'])) {
            $query->where('courier_status', $validated['courier_status']);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];

            $query->where(function ($q) use ($search): void {
                $q->where('order_code', 'like', "%{$search}%")
                    ->orWhere('invoice_no', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($qc) use ($search): void {
                        $qc->where('name', 'like', "%{$search}%")
                            ->orWhere('phone_normalized', 'like', "%{$search}%");
                    });
            });
        }

        $summary = [
            'total' => (clone $query)->count(),
            'outstanding_count' => (clone $query)->where('due_amount', '>', 0)->count(),
            'due_amount' => (int) (clone $query)->sum('due_amount'),
            'ready_count' => (clone $query)->where('laundry_status', 'ready')->count(),
            'completed_count' => (clone $query)->where('laundry_status', 'completed')->count(),
            'pickup_delivery_count' => (clone $query)->where('is_pickup_delivery', true)->count(),
        ];

        $limit = (int) ($validated['limit'] ?? 20);
        $orders = $query->paginate($limit)->withQueryString();

        return view('web.orders.index', [
            'tenant' => $tenant,
            'user' => $user,
            'ownerMode' => $ownerMode,
            'filters' => $validated,
            'outlets' => $outlets,
            'couriers' => $couriers,
            'orders' => $orders,
            'summary' => $summary,
        ]);
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

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()
            ->where('tenant_id', $tenant->id)
            ->with(['customer:id,name,phone_normalized', 'outlet:id,name,code', 'courier:id,name'])
            ->latest('created_at');

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        if (! empty($validated['outlet_id'])) {
            $query->where('outlet_id', $validated['outlet_id']);
        }

        if (! empty($validated['laundry_status'])) {
            $query->where('laundry_status', $validated['laundry_status']);
        }

        if (! empty($validated['courier_status'])) {
            $query->where('courier_status', $validated['courier_status']);
        }

        if (! empty($validated['search'])) {
            $search = $validated['search'];

            $query->where(function ($q) use ($search): void {
                $q->where('order_code', 'like', "%{$search}%")
                    ->orWhere('invoice_no', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($qc) use ($search): void {
                        $qc->where('name', 'like', "%{$search}%")
                            ->orWhere('phone_normalized', 'like', "%{$search}%");
                    });
            });
        }

        $filename = sprintf('orders-%s-%s.csv', $tenant->id, now()->format('Ymd-His'));

        return response()->streamDownload(function () use ($query): void {
            $handle = fopen('php://output', 'wb');

            if ($handle === false) {
                return;
            }

            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, [
                'invoice_or_order_code',
                'order_code',
                'outlet_code',
                'outlet_name',
                'customer_name',
                'customer_phone',
                'laundry_status',
                'courier_status',
                'courier_name',
                'is_pickup_delivery',
                'total_amount',
                'paid_amount',
                'due_amount',
                'created_at',
            ]);

            $query
                ->chunk(200, function ($orders) use ($handle): void {
                    foreach ($orders as $order) {
                        fputcsv($handle, [
                            $order->invoice_no ?: $order->order_code,
                            $order->order_code,
                            (string) ($order->outlet?->code ?? ''),
                            (string) ($order->outlet?->name ?? ''),
                            (string) ($order->customer?->name ?? ''),
                            (string) ($order->customer?->phone_normalized ?? ''),
                            (string) ($order->laundry_status ?? ''),
                            (string) ($order->courier_status ?? ''),
                            (string) ($order->courier?->name ?? ''),
                            $order->is_pickup_delivery ? '1' : '0',
                            (string) (int) $order->total_amount,
                            (string) (int) $order->paid_amount,
                            (string) (int) $order->due_amount,
                            (string) optional($order->created_at)->format('Y-m-d H:i:s'),
                        ]);
                    }
                });

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        ]);
    }

    public function create(Request $request, Tenant $tenant): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $outletsQuery = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name');

        if (! $ownerMode) {
            $outletsQuery->whereIn('id', $allowedOutletIds);
        }

        $outlets = $outletsQuery->get(['id', 'name', 'code']);

        $services = Service::query()
            ->where('tenant_id', $tenant->id)
            ->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'unit_type', 'base_price_amount']);

        $outletIds = $outlets->pluck('id')->values()->all();
        $serviceIds = $services->pluck('id')->values()->all();

        $outletServicePriceMap = OutletService::query()
            ->whereIn('outlet_id', $outletIds)
            ->whereIn('service_id', $serviceIds)
            ->where('active', true)
            ->whereNotNull('price_override_amount')
            ->get(['outlet_id', 'service_id', 'price_override_amount'])
            ->groupBy('outlet_id')
            ->map(function ($rows): array {
                return collect($rows)->mapWithKeys(function ($row): array {
                    return [
                        (string) $row->service_id => (int) $row->price_override_amount,
                    ];
                })->all();
            })
            ->all();

        $customerSeeds = Customer::query()
            ->where('tenant_id', $tenant->id)
            ->orderByDesc('updated_at')
            ->limit(200)
            ->get(['id', 'name', 'phone_normalized', 'notes']);

        return view('web.orders.create', [
            'tenant' => $tenant,
            'user' => $user,
            'ownerMode' => $ownerMode,
            'outlets' => $outlets,
            'services' => $services,
            'outletServicePriceMap' => $outletServicePriceMap,
            'customerSeeds' => $customerSeeds,
            'quota' => $this->quotaService->snapshot($tenant->id),
        ]);
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
            'is_pickup_delivery' => ['nullable', 'boolean'],
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
            'items' => ['required', 'array', 'min:1'],
            'items.*.service_id' => ['required', 'uuid'],
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

        $isPickup = (bool) ($validated['is_pickup_delivery'] ?? false);
        $shippingFee = (int) ($validated['shipping_fee_amount'] ?? 0);
        $discount = (int) ($validated['discount_amount'] ?? 0);

        $pickupAddress = trim((string) ($validated['pickup_address'] ?? ''));
        $pickupSlot = trim((string) ($validated['pickup_slot'] ?? ''));
        $deliveryAddress = trim((string) ($validated['delivery_address'] ?? ''));
        $deliverySlot = trim((string) ($validated['delivery_slot'] ?? ''));

        $pickup = ($pickupAddress !== '' || $pickupSlot !== '')
            ? [
                'address_short' => $pickupAddress !== '' ? $pickupAddress : null,
                'slot' => $pickupSlot !== '' ? $pickupSlot : null,
            ]
            : null;

        $delivery = ($deliveryAddress !== '' || $deliverySlot !== '')
            ? [
                'address_short' => $deliveryAddress !== '' ? $deliveryAddress : null,
                'slot' => $deliverySlot !== '' ? $deliverySlot : null,
            ]
            : null;

        try {
            $order = DB::transaction(function () use ($validated, $tenant, $user, $isPickup, $shippingFee, $discount, $outletId, $pickup, $delivery): Order {
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
                    'is_pickup_delivery' => $isPickup,
                    'laundry_status' => 'received',
                    'courier_status' => $isPickup ? 'pickup_pending' : null,
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

                foreach ($validated['items'] as $index => $item) {
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

                $total = max($subTotal + $shippingFee - $discount, 0);

                $order->forceFill([
                    'total_amount' => $total,
                    'paid_amount' => 0,
                    'due_amount' => $total,
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

        if ($order->is_pickup_delivery) {
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
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $order->id])
            ->with('status', 'Transaksi baru berhasil dibuat.');
    }

    public function show(Request $request, Tenant $tenant, string $order): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()
            ->where('tenant_id', $tenant->id)
            ->with([
                'customer:id,name,phone_normalized',
                'outlet:id,name,code,timezone,address',
                'courier:id,name,phone',
                'items:id,order_id,service_id,service_name_snapshot,unit_type_snapshot,qty,weight_kg,unit_price_amount,subtotal_amount',
                'payments:id,order_id,amount,method,paid_at,notes',
            ]);

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $orderRow = $query->where('id', $order)->firstOrFail();

        $orderRow->setRelation(
            'payments',
            $orderRow->payments->sortByDesc('paid_at')->values(),
        );

        $laundryTimeline = $this->buildTimeline(
            ['received', 'washing', 'drying', 'ironing', 'ready', 'completed'],
            $orderRow->laundry_status,
        );

        $courierTimeline = $this->buildTimeline(
            ['pickup_pending', 'pickup_on_the_way', 'picked_up', 'at_outlet', 'delivery_pending', 'delivery_on_the_way', 'delivered'],
            $orderRow->courier_status,
        );

        $allowedLaundryStatuses = $this->allowedLaundryStatusesForCurrent((string) $orderRow->laundry_status);
        $allowedCourierStatuses = $this->allowedCourierStatusesForCurrent(
            currentStatus: (string) ($orderRow->courier_status ?: 'pickup_pending'),
            laundryStatus: (string) $orderRow->laundry_status,
            isPickupDelivery: (bool) $orderRow->is_pickup_delivery,
        );

        $couriers = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->whereHas('roles', fn ($q) => $q->where('key', 'courier'))
            ->whereHas('outlets', fn ($q) => $q->where('outlets.id', $orderRow->outlet_id))
            ->orderBy('name')
            ->get(['id', 'name']);

        return view('web.orders.show', [
            'tenant' => $tenant,
            'user' => $user,
            'ownerMode' => $ownerMode,
            'orderRow' => $orderRow,
            'laundryTimeline' => $laundryTimeline,
            'courierTimeline' => $courierTimeline,
            'allowedLaundryStatuses' => $allowedLaundryStatuses,
            'allowedCourierStatuses' => $allowedCourierStatuses,
            'couriers' => $couriers,
        ]);
    }

    public function receipt(Request $request, Tenant $tenant, string $order): View
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()
            ->where('tenant_id', $tenant->id)
            ->with([
                'customer:id,name,phone_normalized',
                'outlet:id,name,code,address,timezone',
                'items:id,order_id,service_name_snapshot,unit_type_snapshot,qty,weight_kg,unit_price_amount,subtotal_amount',
                'payments:id,order_id,amount,method,paid_at,notes',
            ]);

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $orderRow = $query->where('id', $order)->firstOrFail();
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
        $this->ensureOperationalWriteAccess($tenant->id);

        $validated = $request->validate([
            'laundry_status' => ['required', 'string', 'in:received,washing,drying,ironing,ready,completed'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $orderRow = $query->where('id', $order)->firstOrFail();
        $targetStatus = (string) $validated['laundry_status'];

        $result = $this->applyLaundryTransition(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            request: $request,
            targetStatus: $targetStatus,
            actionKey: 'single-laundry-update',
            isBulkAction: false,
        );

        if (! $result['updated']) {
            throw ValidationException::withMessages([
                'laundry_status' => [$result['reason_label']],
            ]);
        }

        return redirect()
            ->route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $orderRow->id])
            ->with('status', 'Status laundry berhasil diperbarui.');
    }

    public function updateCourierStatus(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOperationalWriteAccess($tenant->id);

        $validated = $request->validate([
            'courier_status' => ['required', 'string', 'in:pickup_pending,pickup_on_the_way,picked_up,at_outlet,delivery_pending,delivery_on_the_way,delivered'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $orderRow = $query->where('id', $order)->firstOrFail();
        $targetStatus = (string) $validated['courier_status'];

        $result = $this->applyCourierTransition(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            request: $request,
            targetStatus: $targetStatus,
            actionKey: 'single-courier-update',
            isBulkAction: false,
        );

        if (! $result['updated']) {
            throw ValidationException::withMessages([
                'courier_status' => [$result['reason_label']],
            ]);
        }

        return redirect()
            ->route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $orderRow->id])
            ->with('status', 'Status kurir berhasil diperbarui.');
    }

    public function assignCourier(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOperationalWriteAccess($tenant->id);

        $validated = $request->validate([
            'courier_user_id' => ['required', 'integer', 'min:1'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $orderRow = $query->where('id', $order)->firstOrFail();
        $courierUserId = (int) $validated['courier_user_id'];

        $targetCourier = User::query()
            ->with('roles:id,key')
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->where('id', $courierUserId)
            ->first();

        $result = $this->applyCourierAssignment(
            order: $orderRow,
            user: $user,
            tenant: $tenant,
            request: $request,
            targetCourier: $targetCourier,
            courierUserId: $courierUserId,
            actionKey: 'single-courier-assign',
            isBulkAction: false,
        );

        if (! $result['updated']) {
            throw ValidationException::withMessages([
                'courier_user_id' => [$result['reason_label']],
            ]);
        }

        return redirect()
            ->route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $orderRow->id])
            ->with('status', 'Kurir berhasil ditetapkan ke pesanan.');
    }

    public function addPayment(Request $request, Tenant $tenant, string $order): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensurePanelAccess($user, $tenant);
        $this->ensureOperationalWriteAccess($tenant->id);

        $validated = $request->validate([
            'amount' => ['nullable', 'integer', 'min:1'],
            'method' => ['required', 'string', 'max:30'],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'quick_action' => ['nullable', 'string', 'in:full,half,fixed_10000'],
        ]);

        $ownerMode = $this->isOwner($user);
        $allowedOutletIds = $this->allowedOutletIds($user, $tenant->id);

        $query = Order::query()->where('tenant_id', $tenant->id);

        if (! $ownerMode) {
            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        $orderRow = $query->where('id', $order)->firstOrFail();
        $quickAction = (string) ($validated['quick_action'] ?? '');
        $amountInput = $validated['amount'] ?? null;
        $amountToPay = null;

        if ($quickAction !== '') {
            $dueAmount = (int) $orderRow->due_amount;

            if ($dueAmount <= 0) {
                throw ValidationException::withMessages([
                    'payment' => ['Pesanan sudah lunas, tidak perlu quick payment tambahan.'],
                ]);
            }

            $amountToPay = match ($quickAction) {
                'full' => $dueAmount,
                'half' => max((int) ceil($dueAmount / 2), 1),
                'fixed_10000' => min(10000, $dueAmount),
                default => null,
            };
        }

        if (! is_int($amountToPay)) {
            if (! is_numeric($amountInput)) {
                throw ValidationException::withMessages([
                    'amount' => ['Jumlah pembayaran wajib diisi.'],
                ]);
            }

            $amountToPay = (int) $amountInput;
        }

        $payment = DB::transaction(function () use ($validated, $orderRow, $user, $amountToPay): Payment {
            $payment = Payment::query()->create([
                'order_id' => $orderRow->id,
                'amount' => $amountToPay,
                'method' => trim((string) $validated['method']),
                'paid_at' => filled($validated['paid_at'] ?? null)
                    ? Carbon::parse((string) $validated['paid_at'])
                    : now(),
                'notes' => filled($validated['notes'] ?? null)
                    ? trim((string) $validated['notes'])
                    : null,
                'created_by' => $user->id,
                'updated_by' => $user->id,
                'source_channel' => 'web',
            ]);

            $paidAmount = (int) Payment::query()
                ->where('order_id', $orderRow->id)
                ->sum('amount');

            $orderRow->forceFill([
                'paid_amount' => $paidAmount,
                'due_amount' => max((int) $orderRow->total_amount - $paidAmount, 0),
                'updated_by' => $user->id,
                'source_channel' => 'web',
            ])->save();

            return $payment;
        });

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PAYMENT_ADDED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: $orderRow->outlet_id,
            entityType: 'payment',
            entityId: $payment->id,
            metadata: [
                'order_id' => $orderRow->id,
                'amount' => $payment->amount,
                'method' => $payment->method,
            ],
            channel: 'web',
            request: $request,
        );

        return redirect()
            ->route('tenant.orders.show', ['tenant' => $tenant->id, 'order' => $orderRow->id])
            ->with('status', 'Pembayaran berhasil ditambahkan ke transaksi.');
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
                            ? (string) ($order->courier_status ?: 'pickup_pending')
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

        return redirect()
            ->route('tenant.orders.index', ['tenant' => $tenant->id])
            ->with('status', sprintf(
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

        if ($targetStatus === 'completed' && ! $order->is_pickup_delivery) {
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
        $currentStatus = (string) ($order->courier_status ?: 'pickup_pending');

        if (! $order->is_pickup_delivery) {
            return [
                'updated' => false,
                'reason_code' => 'NOT_PICKUP_DELIVERY',
                'reason_label' => $this->bulkReasonLabel('NOT_PICKUP_DELIVERY'),
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
            'PAYMENT_REQUIRED' => 'Tagihan pesanan belum lunas. Lunasi dulu sebelum menyelesaikan pesanan.',
            'OUT_OF_SCOPE' => 'Order di luar scope tenant/outlet Anda.',
            'NOT_FOUND' => 'Order tidak ditemukan pada tenant ini.',
            'UNKNOWN_ACTION' => 'Action tidak dikenali.',
            default => 'Order dilewati oleh validasi.',
        };
    }

    /**
     * @param  array<int, string>  $steps
     * @return array<int, array{key: string, label: string, state: string}>
     */
    private function buildTimeline(array $steps, ?string $current): array
    {
        $currentIndex = array_search((string) $current, $steps, true);
        $hasCurrent = $currentIndex !== false;

        return collect($steps)
            ->map(function (string $step, int $index) use ($hasCurrent, $currentIndex): array {
                $state = 'todo';

                if ($hasCurrent) {
                    if ($index < $currentIndex) {
                        $state = 'done';
                    } elseif ($index === $currentIndex) {
                        $state = 'current';
                    }
                }

                return [
                    'key' => $step,
                    'label' => str_replace('_', ' ', ucfirst($step)),
                    'state' => $state,
                ];
            })
            ->all();
    }

    /**
     * @return array<int, string>
     */
    private function allowedLaundryStatusesForCurrent(string $currentStatus): array
    {
        return match ($currentStatus) {
            'received' => ['received', 'washing'],
            'washing' => ['washing', 'drying'],
            'drying' => ['drying', 'ironing'],
            'ironing' => ['ironing', 'ready'],
            'ready' => ['ready', 'completed'],
            'completed' => ['completed'],
            default => ['received'],
        };
    }

    /**
     * @return array<int, string>
     */
    private function allowedCourierStatusesForCurrent(string $currentStatus, string $laundryStatus, bool $isPickupDelivery): array
    {
        if (! $isPickupDelivery) {
            return [];
        }

        if ($currentStatus === 'at_outlet' && ! in_array($laundryStatus, ['ready', 'completed'], true)) {
            return ['at_outlet'];
        }

        return match ($currentStatus) {
            'pickup_pending' => ['pickup_pending', 'pickup_on_the_way'],
            'pickup_on_the_way' => ['pickup_on_the_way', 'picked_up'],
            'picked_up' => ['picked_up', 'at_outlet'],
            'at_outlet' => ['at_outlet', 'delivery_pending'],
            'delivery_pending' => ['delivery_pending', 'delivery_on_the_way'],
            'delivery_on_the_way' => ['delivery_on_the_way', 'delivered'],
            'delivered' => ['delivered'],
            default => ['pickup_pending'],
        };
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
}
