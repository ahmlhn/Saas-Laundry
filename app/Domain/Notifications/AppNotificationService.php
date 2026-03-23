<?php

namespace App\Domain\Notifications;

use App\Models\AppNotification;
use App\Models\Order;
use App\Models\Payment;
use App\Models\SubscriptionInvoice;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class AppNotificationService
{
    public function __construct(
        private readonly ExpoPushService $expoPushService,
    ) {
    }

    /**
     * @param iterable<User> $users
     * @param array<string, mixed> $payload
     */
    public function notifyUsers(iterable $users, array $payload): void
    {
        $now = now();
        $rows = [];
        $recipients = [];

        foreach ($users as $user) {
            if (! $user instanceof User) {
                continue;
            }

            $recipients[] = $user;
            $rows[] = [
                'id' => (string) Str::uuid(),
                'tenant_id' => $payload['tenant_id'] ?? $user->tenant_id,
                'user_id' => $user->id,
                'outlet_id' => $payload['outlet_id'] ?? null,
                'type' => (string) $payload['type'],
                'priority' => (string) ($payload['priority'] ?? 'normal'),
                'title' => (string) $payload['title'],
                'body' => (string) $payload['body'],
                'action_type' => $payload['action_type'] ?? null,
                'action_payload' => isset($payload['action_payload']) ? json_encode($payload['action_payload'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                'meta' => isset($payload['meta']) ? json_encode($payload['meta'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                'read_at' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows === []) {
            return;
        }

        AppNotification::query()->insert($rows);
        $this->expoPushService->sendToUsers($recipients, $payload);
    }

    /**
     * @param array<int, string> $roleKeys
     * @param array<string, mixed> $payload
     */
    public function notifyTenantUsersByRoles(string $tenantId, ?string $outletId, array $roleKeys, array $payload): void
    {
        $query = User::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->whereNull('deleted_at')
            ->whereHas('roles', fn ($roles) => $roles->whereIn('key', $roleKeys));

        if ($outletId) {
            $query->where(function ($scoped) use ($outletId): void {
                $scoped->whereHas('roles', fn ($roles) => $roles->where('key', 'owner'))
                    ->orWhereHas('outlets', fn ($outlets) => $outlets->where('outlets.id', $outletId));
            });
        }

        /** @var Collection<int, User> $users */
        $users = $query->get(['id', 'tenant_id', 'status']);
        $this->notifyUsers($users, $payload);
    }

    public function notifyOrderPaymentRecorded(Order $order, Payment $payment): void
    {
        $this->notifyTenantUsersByRoles((string) $order->tenant_id, (string) $order->outlet_id, ['owner', 'admin', 'cashier'], [
            'tenant_id' => (string) $order->tenant_id,
            'outlet_id' => (string) $order->outlet_id,
            'type' => 'payment_recorded',
            'priority' => 'normal',
            'title' => 'Pembayaran order masuk',
            'body' => sprintf('Pembayaran Rp %s untuk order %s sudah dicatat.', number_format((int) $payment->amount, 0, ',', '.'), (string) $order->order_code),
            'action_type' => 'open_order_detail',
            'action_payload' => [
                'order_id' => (string) $order->id,
            ],
            'meta' => [
                'order_id' => (string) $order->id,
                'payment_id' => (string) $payment->id,
            ],
        ]);
    }

    public function notifyLaundryReady(Order $order): void
    {
        $this->notifyTenantUsersByRoles((string) $order->tenant_id, (string) $order->outlet_id, ['owner', 'admin', 'cashier'], [
            'tenant_id' => (string) $order->tenant_id,
            'outlet_id' => (string) $order->outlet_id,
            'type' => 'laundry_ready',
            'priority' => 'high',
            'title' => 'Laundry siap diambil',
            'body' => sprintf('Order %s sudah siap. Cek pickup atau informasikan ke pelanggan.', (string) $order->order_code),
            'action_type' => 'open_order_detail',
            'action_payload' => [
                'order_id' => (string) $order->id,
            ],
            'meta' => [
                'order_id' => (string) $order->id,
            ],
        ]);
    }

    public function notifyDeliveryPending(Order $order): void
    {
        $this->notifyTenantUsersByRoles((string) $order->tenant_id, (string) $order->outlet_id, ['owner', 'admin', 'courier'], [
            'tenant_id' => (string) $order->tenant_id,
            'outlet_id' => (string) $order->outlet_id,
            'type' => 'delivery_pending',
            'priority' => 'high',
            'title' => 'Order siap untuk diantar',
            'body' => sprintf('Order %s masuk antrian pengantaran.', (string) $order->order_code),
            'action_type' => 'open_order_detail',
            'action_payload' => [
                'order_id' => (string) $order->id,
            ],
            'meta' => [
                'order_id' => (string) $order->id,
            ],
        ]);
    }

    public function notifyDelivered(Order $order): void
    {
        $this->notifyTenantUsersByRoles((string) $order->tenant_id, (string) $order->outlet_id, ['owner', 'admin', 'cashier'], [
            'tenant_id' => (string) $order->tenant_id,
            'outlet_id' => (string) $order->outlet_id,
            'type' => 'order_delivered',
            'priority' => 'normal',
            'title' => 'Pesanan sudah diantar',
            'body' => sprintf('Order %s sudah ditandai selesai di lokasi pelanggan.', (string) $order->order_code),
            'action_type' => 'open_order_detail',
            'action_payload' => [
                'order_id' => (string) $order->id,
            ],
            'meta' => [
                'order_id' => (string) $order->id,
            ],
        ]);
    }

    public function notifySubscriptionInvoiceReviewed(SubscriptionInvoice $invoice, bool $approved): void
    {
        $tenantId = (string) $invoice->tenant_id;

        $this->notifyTenantUsersByRoles($tenantId, null, ['owner'], [
            'tenant_id' => $tenantId,
            'type' => $approved ? 'subscription_invoice_approved' : 'subscription_invoice_rejected',
            'priority' => $approved ? 'normal' : 'high',
            'title' => $approved ? 'Pembayaran langganan disetujui' : 'Pembayaran langganan ditolak',
            'body' => $approved
                ? sprintf('Invoice %s sudah diverifikasi. Akses tenant kembali aktif.', (string) $invoice->invoice_no)
                : sprintf('Invoice %s ditolak. Periksa bukti pembayaran dan kirim ulang jika perlu.', (string) $invoice->invoice_no),
            'action_type' => 'open_subscription_center',
            'action_payload' => [
                'screen' => 'subscription_center',
            ],
            'meta' => [
                'invoice_id' => (string) $invoice->id,
            ],
        ]);
    }
}
