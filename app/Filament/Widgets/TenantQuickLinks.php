<?php

namespace App\Filament\Widgets;

use App\Filament\Pages\Billing;
use App\Filament\Pages\Subscription;
use App\Filament\Pages\WhatsApp;
use App\Filament\Resources\OutletServices\OutletServiceResource;
use Filament\Widgets\Widget;

class TenantQuickLinks extends Widget
{
    protected string $view = 'filament.widgets.tenant-quick-links';

    protected int|string|array $columnSpan = 'full';

    protected function getViewData(): array
    {
        $links = [
            [
                'title' => 'Buat Order Baru',
                'description' => 'Masuk ke flow order detail yang lama untuk input item dan pickup/delivery.',
                'url' => route('tenant.orders.create'),
            ],
            [
                'title' => 'Billing',
                'description' => 'Kelola piutang dan tindak lanjut penagihan tenant.',
                'url' => Billing::getUrl(panel: 'tenant'),
            ],
            [
                'title' => 'Outlet Services',
                'description' => 'Atur aktivasi layanan per outlet dan override harga.',
                'url' => OutletServiceResource::getUrl(name: 'index', panel: 'tenant'),
            ],
        ];

        if (Subscription::canAccess()) {
            $links[] = [
                'title' => 'Subscription',
                'description' => 'Pantau paket, invoice, dan request perubahan langganan.',
                'url' => Subscription::getUrl(panel: 'tenant'),
            ];
        }

        if (WhatsApp::canAccess()) {
            $links[] = [
                'title' => 'WhatsApp',
                'description' => 'Konfigurasi provider dan jalur notifikasi tenant.',
                'url' => WhatsApp::getUrl(panel: 'tenant'),
            ];
        }

        return [
            'links' => $links,
        ];
    }
}
