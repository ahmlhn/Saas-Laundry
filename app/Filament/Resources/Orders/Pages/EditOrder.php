<?php

namespace App\Filament\Resources\Orders\Pages;

use App\Filament\Resources\Orders\Pages\Concerns\InteractsWithOrderWorkflow;
use App\Filament\Resources\Orders\OrderResource;
use Filament\Actions\ViewAction;
use Filament\Resources\Pages\EditRecord;

class EditOrder extends EditRecord
{
    use InteractsWithOrderWorkflow;

    protected static string $resource = OrderResource::class;

    protected function getHeaderActions(): array
    {
        return [
            ViewAction::make(),
            ...$this->getOrderWorkflowActions(),
        ];
    }
}
