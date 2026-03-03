<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Illuminate\View\View;

class CustomerTrackingController extends Controller
{
    public function show(string $token): View
    {
        $order = Order::query()
            ->where('tracking_token', $token)
            ->with([
                'tenant:id,name',
                'outlet:id,name,code,timezone,address',
                'customer:id,name,phone_normalized',
                'courier:id,name',
                'items:id,order_id,service_name_snapshot,unit_type_snapshot,qty,weight_kg,subtotal_amount',
                'payments:id,order_id,amount,method,paid_at',
            ])
            ->first();

        if (! $order) {
            abort(404);
        }

        $invoiceLabel = $order->invoice_no ?: $order->order_code;
        $statusMap = $this->statusMap();
        $currentStep = $this->currentLaundryStep((string) $order->laundry_status);

        return view('web.customer-tracking.show', [
            'title' => 'Lacak Pesanan',
            'order' => $order,
            'invoiceLabel' => $invoiceLabel,
            'statusClass' => fn (?string $status): string => $this->statusClass($status),
            'statusLabel' => fn (?string $status): string => $this->statusLabel($status),
            'statusMap' => $statusMap,
            'currentStep' => $currentStep,
            'paymentStatusLabel' => $order->due_amount > 0 ? 'Belum Lunas' : 'Lunas',
            'trackingUrl' => route('customer.track', ['token' => $order->tracking_token]),
        ]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function statusMap(): array
    {
        return [
            ['key' => 'received', 'label' => 'Diterima'],
            ['key' => 'washing', 'label' => 'Cuci'],
            ['key' => 'drying', 'label' => 'Kering'],
            ['key' => 'ironing', 'label' => 'Setrika'],
            ['key' => 'ready', 'label' => 'Siap'],
            ['key' => 'completed', 'label' => 'Selesai'],
        ];
    }

    private function currentLaundryStep(string $status): int
    {
        $steps = collect($this->statusMap())->pluck('key')->values()->all();
        $index = array_search($status, $steps, true);

        return $index === false ? 0 : $index;
    }

    private function statusClass(?string $status): string
    {
        if (! $status) {
            return 'status-neutral';
        }

        return match ($status) {
            'completed', 'ready', 'delivered' => 'status-success',
            'received', 'pickup_pending', 'delivery_pending' => 'status-warning',
            default => 'status-info',
        };
    }

    private function statusLabel(?string $status): string
    {
        if (! $status) {
            return '-';
        }

        return match ($status) {
            'received' => 'diterima',
            'washing' => 'dicuci',
            'drying' => 'dikeringkan',
            'ironing' => 'disetrika',
            'ready' => 'siap',
            'completed' => 'selesai',
            'pickup_pending' => 'jemput tertunda',
            'pickup_on_the_way' => 'kurir menuju jemput',
            'picked_up' => 'sudah dijemput',
            'at_outlet' => 'di outlet',
            'delivery_pending' => 'antar tertunda',
            'delivery_on_the_way' => 'kurir menuju antar',
            'delivered' => 'terkirim',
            default => str_replace('_', ' ', $status),
        };
    }
}
