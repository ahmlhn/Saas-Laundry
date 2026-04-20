<?php

namespace App\Filament\Widgets;

use App\Filament\Support\TenantPanelAccess;
use App\Models\Order;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Actions\ViewAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;
use Illuminate\Database\Eloquent\Builder;

class RecentOrders extends TableWidget
{
    protected int|string|array $columnSpan = 'full';

    public function table(Table $table): Table
    {
        return $table
            ->query(fn (): Builder => Order::query()
                ->with([
                    'customer:id,name',
                    'outlet:id,name,tenant_id',
                ])
                ->where('tenant_id', TenantPanelAccess::tenantId())
                ->when(
                    ! TenantPanelAccess::isOwner(),
                    fn (Builder $query) => $query->whereIn('outlet_id', TenantPanelAccess::allowedOutletIds()),
                )
                ->latest('created_at')
            )
            ->columns([
                TextColumn::make('order_code')
                    ->label('Kode')
                    ->searchable(),
                TextColumn::make('customer.name')
                    ->label('Pelanggan'),
                TextColumn::make('outlet.name')
                    ->label('Outlet'),
                TextColumn::make('total_amount')
                    ->label('Total')
                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                TextColumn::make('laundry_status')
                    ->label('Laundry')
                    ->badge(),
                TextColumn::make('created_at')
                    ->label('Masuk')
                    ->since(),
            ])
            ->headerActions([
                Action::make('seeAll')
                    ->label('Lihat semua order')
                    ->url(route('filament.tenant.resources.orders.index')),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make(),
            ]);
    }
}
