<?php

namespace App\Filament\Resources\ShippingZones\Pages;

use App\Filament\Resources\ShippingZones\ShippingZoneResource;
use Filament\Actions\EditAction;
use Filament\Resources\Pages\ViewRecord;

class ViewShippingZone extends ViewRecord
{
    protected static string $resource = ShippingZoneResource::class;

    protected function getHeaderActions(): array
    {
        return [
            EditAction::make(),
        ];
    }
}
