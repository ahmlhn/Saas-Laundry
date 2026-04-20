<?php

namespace App\Filament\Resources\ShippingZones\Pages;

use App\Filament\Resources\ShippingZones\ShippingZoneResource;
use Filament\Actions\DeleteAction;
use Filament\Actions\ViewAction;
use Filament\Resources\Pages\EditRecord;

class EditShippingZone extends EditRecord
{
    protected static string $resource = ShippingZoneResource::class;

    protected function getHeaderActions(): array
    {
        return [
            ViewAction::make(),
            DeleteAction::make(),
        ];
    }
}
