<?php

namespace App\Domain\Orders;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Domain\Billing\QuotaService;
use App\Domain\Billing\TenantWriteAccessException;
use App\Domain\Messaging\WaDispatchService;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderWorkflowService
{
    public function __construct(
        private readonly OrderStatusTransitionValidator $statusValidator,
        private readonly QuotaService $quotaService,
        private readonly WaDispatchService $waDispatchService,
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function ensureOperationalWriteAccess(string $tenantId): void
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

    /**
     * @return array{updated: bool, reason_code: string, reason_label: string, from: string, to: string}
     */
    public function updateLaundryStatus(
        Order $order,
        User $user,
        Tenant $tenant,
        string $targetStatus,
        ?Request $request = null,
        string $actionKey = 'single-laundry-update',
        bool $isBulkAction = false,
    ): array {
        $this->ensureOperationalWriteAccess($tenant->id);

        $currentStatus = (string) $order->laundry_status;

        if ($currentStatus === $targetStatus) {
            return [
                'updated' => false,
                'reason_code' => 'UNCHANGED',
                'reason_label' => $this->reasonLabel('UNCHANGED'),
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
                'reason_label' => $this->reasonLabel($reasonCode),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus !== 'received' && ! OrderItem::query()->where('order_id', $order->id)->exists()) {
            return [
                'updated' => false,
                'reason_code' => 'ITEMS_REQUIRED',
                'reason_label' => $this->reasonLabel('ITEMS_REQUIRED'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus === 'completed' && (int) $order->due_amount > 0) {
            return [
                'updated' => false,
                'reason_code' => 'PAYMENT_REQUIRED',
                'reason_label' => $this->reasonLabel('PAYMENT_REQUIRED'),
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
            'reason_label' => $this->reasonLabel('UPDATED'),
            'from' => $currentStatus,
            'to' => $targetStatus,
        ];
    }

    /**
     * @return array{updated: bool, reason_code: string, reason_label: string, from: string, to: string}
     */
    public function updateCourierStatus(
        Order $order,
        User $user,
        Tenant $tenant,
        string $targetStatus,
        ?Request $request = null,
        string $actionKey = 'single-courier-update',
        bool $isBulkAction = false,
    ): array {
        $this->ensureOperationalWriteAccess($tenant->id);

        $requiresPickup = (bool) ($order->requires_pickup ?? false);
        $requiresDelivery = (bool) ($order->requires_delivery ?? false);
        $currentStatus = (string) ($order->courier_status ?: $this->resolveInitialCourierStatus($requiresPickup, $requiresDelivery));

        if (! $order->is_pickup_delivery) {
            return [
                'updated' => false,
                'reason_code' => 'NOT_PICKUP_DELIVERY',
                'reason_label' => $this->reasonLabel('NOT_PICKUP_DELIVERY'),
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
                'reason_label' => $this->reasonLabel('UNCHANGED'),
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
                'reason_label' => $this->reasonLabel($reasonCode),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus === 'delivery_pending' && ! in_array((string) $order->laundry_status, ['ready', 'completed'], true)) {
            return [
                'updated' => false,
                'reason_code' => 'LAUNDRY_NOT_READY',
                'reason_label' => $this->reasonLabel('LAUNDRY_NOT_READY'),
                'from' => $currentStatus,
                'to' => $targetStatus,
            ];
        }

        if ($targetStatus === 'delivered' && (int) $order->due_amount > 0) {
            return [
                'updated' => false,
                'reason_code' => 'PAYMENT_REQUIRED',
                'reason_label' => $this->reasonLabel('PAYMENT_REQUIRED'),
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
            'reason_label' => $this->reasonLabel('UPDATED'),
            'from' => $currentStatus,
            'to' => $targetStatus,
        ];
    }

    /**
     * @return array{updated: bool, reason_code: string, reason_label: string, from: string, to: string}
     */
    public function assignCourier(
        Order $order,
        User $user,
        Tenant $tenant,
        ?User $targetCourier,
        ?int $courierUserId,
        ?Request $request = null,
        string $actionKey = 'single-courier-assign',
        bool $isBulkAction = false,
    ): array {
        $this->ensureOperationalWriteAccess($tenant->id);

        $currentCourierLabel = $this->resolveCourierLabel($order->courier, $order->courier_user_id);
        $targetCourierLabel = $this->resolveCourierLabel($targetCourier, $courierUserId);

        if (! $order->is_pickup_delivery) {
            return [
                'updated' => false,
                'reason_code' => 'NOT_PICKUP_DELIVERY',
                'reason_label' => $this->reasonLabel('NOT_PICKUP_DELIVERY'),
                'from' => $currentCourierLabel,
                'to' => $targetCourierLabel,
            ];
        }

        if (! $targetCourier || ! $targetCourier->hasRole('courier') || (string) $targetCourier->status !== 'active') {
            return [
                'updated' => false,
                'reason_code' => 'COURIER_INVALID',
                'reason_label' => $this->reasonLabel('COURIER_INVALID'),
                'from' => $currentCourierLabel,
                'to' => $targetCourierLabel,
            ];
        }

        if ((int) ($order->courier_user_id ?? 0) === (int) $targetCourier->id) {
            return [
                'updated' => false,
                'reason_code' => 'UNCHANGED',
                'reason_label' => $this->reasonLabel('UNCHANGED'),
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
            'reason_label' => $this->reasonLabel('UPDATED'),
            'from' => $currentCourierLabel,
            'to' => $targetCourierLabel,
        ];
    }

    public function addPayment(
        Order $order,
        User $user,
        Tenant $tenant,
        array $validated,
        ?Request $request = null,
    ): Payment {
        $this->ensureOperationalWriteAccess($tenant->id);

        $quickAction = (string) ($validated['quick_action'] ?? '');
        $amountInput = $validated['amount'] ?? null;
        $amountToPay = null;

        if ($quickAction !== '') {
            $dueAmount = (int) $order->due_amount;

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

        $payment = DB::transaction(function () use ($validated, $order, $user, $amountToPay): Payment {
            $payment = Payment::query()->create([
                'order_id' => $order->id,
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
                ->where('order_id', $order->id)
                ->sum('amount');

            $order->forceFill([
                'paid_amount' => $paidAmount,
                'due_amount' => max((int) $order->total_amount - $paidAmount, 0),
                'updated_by' => $user->id,
                'source_channel' => 'web',
            ])->save();

            return $payment;
        });

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PAYMENT_ADDED,
            actor: $user,
            tenantId: $tenant->id,
            outletId: $order->outlet_id,
            entityType: 'payment',
            entityId: $payment->id,
            metadata: [
                'order_id' => $order->id,
                'amount' => $payment->amount,
                'method' => $payment->method,
            ],
            channel: 'web',
            request: $request,
        );

        $order->refresh();

        return $payment;
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    public function courierOptionsFor(User $user, Tenant $tenant, ?string $outletId = null): array
    {
        $query = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->whereHas('roles', fn (Builder $builder) => $builder->where('key', 'courier'))
            ->orderBy('name');

        if (TenantPanelAccess::isOwner($user)) {
            if (filled($outletId)) {
                $query->whereHas('outlets', fn (Builder $builder) => $builder->where('outlets.id', $outletId));
            }
        } else {
            $allowedOutletIds = TenantPanelAccess::allowedOutletIds($user);
            $scopeOutletIds = filled($outletId) ? array_values(array_intersect($allowedOutletIds, [(string) $outletId])) : $allowedOutletIds;

            $query->whereHas('outlets', fn (Builder $builder) => $builder->whereIn('outlets.id', $scopeOutletIds));
        }

        return $query
            ->get(['id', 'name'])
            ->map(fn (User $courier): array => [
                'id' => (int) $courier->id,
                'name' => (string) $courier->name,
            ])
            ->all();
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

    private function reasonLabel(string $reasonCode): string
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
            default => 'Order dilewati oleh validasi.',
        };
    }
}
