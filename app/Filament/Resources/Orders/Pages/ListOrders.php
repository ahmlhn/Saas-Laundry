<?php

namespace App\Filament\Resources\Orders\Pages;

use App\Filament\Pages\OrderCreate;
use App\Filament\Resources\Orders\OrderResource;
use App\Filament\Support\TenantPanelAccess;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Support\Arr;

class ListOrders extends ListRecords
{
    protected static string $resource = OrderResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('createOrder')
                ->label('Order Baru')
                ->icon('heroicon-o-plus')
                ->url(OrderCreate::getUrl(panel: 'tenant')),
            Action::make('exportOrders')
                ->label('Export CSV')
                ->icon('heroicon-o-arrow-down-tray')
                ->color('gray')
                ->form([
                    Select::make('outlet_id')
                        ->label('Outlet')
                        ->options(TenantPanelAccess::assignableOutletOptions())
                        ->placeholder('Semua outlet')
                        ->native(false),
                    Select::make('laundry_status')
                        ->label('Status laundry')
                        ->options([
                            'received' => 'Received',
                            'washing' => 'Washing',
                            'drying' => 'Drying',
                            'ironing' => 'Ironing',
                            'ready' => 'Ready',
                            'completed' => 'Completed',
                        ])
                        ->placeholder('Semua status')
                        ->native(false),
                    Select::make('courier_status')
                        ->label('Status kurir')
                        ->options([
                            'pickup_pending' => 'Pickup pending',
                            'pickup_on_the_way' => 'Pickup on the way',
                            'picked_up' => 'Picked up',
                            'at_outlet' => 'At outlet',
                            'delivery_pending' => 'Delivery pending',
                            'delivery_on_the_way' => 'Delivery on the way',
                            'delivered' => 'Delivered',
                        ])
                        ->placeholder('Semua status')
                        ->native(false),
                    TextInput::make('search')
                        ->label('Cari')
                        ->placeholder('kode, invoice, nama, telepon'),
                ])
                ->modalSubmitActionLabel('Download CSV')
                ->action(function (Action $action, array $data): void {
                    $query = Arr::where($data, fn ($value) => filled($value));

                    $action->redirect(route('tenant.orders.export', $query));
                }),
        ];
    }
}
