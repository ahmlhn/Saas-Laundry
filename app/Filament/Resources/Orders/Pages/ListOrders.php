<?php

namespace App\Filament\Resources\Orders\Pages;

use App\Filament\Resources\Orders\OrderResource;
use Filament\Actions\Action;
use Filament\Resources\Pages\ListRecords;

class ListOrders extends ListRecords
{
    protected static string $resource = OrderResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('createLegacyOrder')
                ->label('Order Baru')
                ->icon('heroicon-o-plus')
                ->url(route('tenant.orders.create')),
        ];
    }
}
