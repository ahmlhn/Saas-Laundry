<?php

namespace App\Filament\Resources\Outlets\Pages;

use App\Filament\Resources\Outlets\OutletResource;
use Filament\Actions\EditAction;
use Filament\Resources\Pages\ViewRecord;

class ViewOutlet extends ViewRecord
{
    protected static string $resource = OutletResource::class;

    protected function getHeaderActions(): array
    {
        return [
            EditAction::make(),
        ];
    }
}
