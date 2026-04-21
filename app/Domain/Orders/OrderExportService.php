<?php

namespace App\Domain\Orders;

use App\Models\Order;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderExportService
{
    /**
     * @param  array<string, mixed>  $filters
     */
    public function streamCsv(Tenant $tenant, User $user, array $filters = []): StreamedResponse
    {
        $query = $this->buildQuery($tenant, $user, $filters);
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

            $query->chunk(200, function ($orders) use ($handle): void {
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

    /**
     * @param  array<string, mixed>  $filters
     */
    public function buildQuery(Tenant $tenant, User $user, array $filters = []): Builder
    {
        $query = Order::query()
            ->where('tenant_id', $tenant->id)
            ->with(['customer:id,name,phone_normalized', 'outlet:id,name,code', 'courier:id,name'])
            ->latest('created_at');

        if (! $user->hasRole('owner')) {
            $allowedOutletIds = $user->outlets()
                ->where('tenant_id', $tenant->id)
                ->pluck('outlets.id')
                ->map(fn ($id): string => (string) $id)
                ->all();

            $query->whereIn('outlet_id', $allowedOutletIds);
        }

        if (filled($filters['outlet_id'] ?? null)) {
            $query->where('outlet_id', (string) $filters['outlet_id']);
        }

        if (filled($filters['laundry_status'] ?? null)) {
            $query->where('laundry_status', (string) $filters['laundry_status']);
        }

        if (filled($filters['courier_status'] ?? null)) {
            $query->where('courier_status', (string) $filters['courier_status']);
        }

        if (filled($filters['search'] ?? null)) {
            $search = (string) $filters['search'];

            $query->where(function (Builder $builder) use ($search): void {
                $builder->where('order_code', 'like', "%{$search}%")
                    ->orWhere('invoice_no', 'like', "%{$search}%")
                    ->orWhereHas('customer', function (Builder $customerQuery) use ($search): void {
                        $customerQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('phone_normalized', 'like', "%{$search}%");
                    });
            });
        }

        return $query;
    }
}
