<?php

namespace App\Filament\Resources\Orders\Pages;

use App\Filament\Resources\Orders\OrderResource;
use Filament\Actions\Action;
use Filament\Actions\ViewAction;
use Filament\Resources\Pages\EditRecord;

class EditOrder extends EditRecord
{
    protected static string $resource = OrderResource::class;

    protected function getHeaderActions(): array
    {
        return [
            ViewAction::make(),
            Action::make('receipt')
                ->label('Nota')
                ->icon('heroicon-o-printer')
                ->url(fn (): string => route('tenant.orders.receipt', $this->record)),
        ];
    }
}
