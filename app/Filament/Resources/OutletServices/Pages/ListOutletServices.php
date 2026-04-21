<?php

namespace App\Filament\Resources\OutletServices\Pages;

use App\Filament\Resources\OutletServices\OutletServiceResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListOutletServices extends ListRecords
{
    protected static string $resource = OutletServiceResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
