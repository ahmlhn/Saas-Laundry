<?php

namespace App\Filament\Resources\Orders\Pages;

use App\Filament\Resources\Orders\Pages\Concerns\InteractsWithOrderWorkflow;
use App\Filament\Resources\Orders\OrderResource;
use Filament\Actions\EditAction;
use Filament\Resources\Pages\ViewRecord;

class ViewOrder extends ViewRecord
{
    use InteractsWithOrderWorkflow;

    protected static string $resource = OrderResource::class;

    protected function getHeaderActions(): array
    {
        return [
            EditAction::make(),
            ...$this->getOrderWorkflowActions(),
        ];
    }
}
