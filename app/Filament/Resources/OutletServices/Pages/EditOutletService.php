<?php

namespace App\Filament\Resources\OutletServices\Pages;

use App\Filament\Resources\OutletServices\OutletServiceResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditOutletService extends EditRecord
{
    protected static string $resource = OutletServiceResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
