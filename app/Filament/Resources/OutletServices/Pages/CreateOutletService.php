<?php

namespace App\Filament\Resources\OutletServices\Pages;

use App\Filament\Resources\OutletServices\OutletServiceResource;
use App\Models\OutletService;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\CreateRecord;

class CreateOutletService extends CreateRecord
{
    protected static string $resource = OutletServiceResource::class;

    protected function beforeCreate(): void
    {
        $data = $this->data;

        $exists = OutletService::query()
            ->where('outlet_id', $data['outlet_id'] ?? null)
            ->where('service_id', $data['service_id'] ?? null)
            ->exists();

        if (! $exists) {
            return;
        }

        Notification::make()
            ->title('Override outlet dan layanan itu sudah ada.')
            ->danger()
            ->send();

        $this->halt();
    }
}
