<?php

namespace App\Filament\Widgets;

use App\Filament\Support\TenantPanelAccess;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Outlet;
use App\Models\Service;
use App\Models\ShippingZone;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

class TenantStatsOverview extends StatsOverviewWidget
{
    protected ?string $heading = 'Ringkasan Tenant';

    protected function getStats(): array
    {
        $tenantId = TenantPanelAccess::tenantId();
        $allowedOutletIds = TenantPanelAccess::allowedOutletIds();

        $ordersQuery = Order::query()
            ->where('tenant_id', $tenantId);

        if (! TenantPanelAccess::isOwner()) {
            $ordersQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        $shippingZonesQuery = ShippingZone::query()
            ->where('tenant_id', $tenantId);

        if (! TenantPanelAccess::isOwner()) {
            $shippingZonesQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        return [
            Stat::make('Order bulan ini', (string) (clone $ordersQuery)
                ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->count())
                ->description('Transaksi yang masuk pada bulan berjalan')
                ->color('success')
                ->url(route('filament.tenant.resources.orders.index')),
            Stat::make('Revenue bulan ini', 'Rp '.number_format((int) (clone $ordersQuery)
                ->whereBetween('created_at', [now()->startOfMonth(), now()->endOfMonth()])
                ->sum('paid_amount'), 0, ',', '.'))
                ->description('Total pembayaran diterima bulan ini')
                ->color('primary')
                ->url(route('filament.tenant.resources.orders.index')),
            Stat::make('Piutang aktif', 'Rp '.number_format((int) (clone $ordersQuery)
                ->where('due_amount', '>', 0)
                ->sum('due_amount'), 0, ',', '.'))
                ->description('Sisa tagihan dari order yang belum lunas')
                ->color('warning')
                ->url(route('tenant.billing.index')),
            Stat::make('Pelanggan', (string) Customer::query()
                ->where('tenant_id', $tenantId)
                ->count())
                ->description('Total pelanggan tersimpan')
                ->color('info')
                ->url(route('filament.tenant.resources.customers.index')),
            Stat::make('Layanan', (string) Service::query()
                ->where('tenant_id', $tenantId)
                ->count())
                ->description('Jumlah layanan aktif dan arsip')
                ->color('gray')
                ->url(route('filament.tenant.resources.services.index')),
            Stat::make('Outlet / Zona', sprintf(
                '%d / %d',
                Outlet::query()
                    ->where('tenant_id', $tenantId)
                    ->when(! TenantPanelAccess::isOwner(), fn ($query) => $query->whereIn('id', $allowedOutletIds))
                    ->count(),
                $shippingZonesQuery->count(),
            ))
                ->description('Cakupan operasional tenant')
                ->color('success')
                ->url(route('filament.tenant.resources.outlets.index')),
        ];
    }
}
