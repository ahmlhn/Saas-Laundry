<?php

namespace App\Filament\Widgets;

use Filament\Widgets\Widget;

class TenantQuickLinks extends Widget
{
    protected string $view = 'filament.widgets.tenant-quick-links';

    protected int|string|array $columnSpan = 'full';

    protected function getViewData(): array
    {
        return [
            'links' => [
                [
                    'title' => 'Buat Order Baru',
                    'description' => 'Masuk ke flow order detail yang lama untuk input item dan pickup/delivery.',
                    'url' => route('tenant.orders.create'),
                ],
                [
                    'title' => 'Billing',
                    'description' => 'Kelola piutang dan tindak lanjut penagihan tenant.',
                    'url' => route('tenant.billing.index'),
                ],
                [
                    'title' => 'Subscription',
                    'description' => 'Pantau paket, invoice, dan request perubahan langganan.',
                    'url' => route('tenant.subscription.index'),
                ],
                [
                    'title' => 'WhatsApp',
                    'description' => 'Konfigurasi provider dan jalur notifikasi tenant.',
                    'url' => route('tenant.wa.index'),
                ],
                [
                    'title' => 'Outlet Services',
                    'description' => 'Atur aktivasi layanan per outlet dan override harga.',
                    'url' => route('tenant.outlet-services.index'),
                ],
            ],
        ];
    }
}
