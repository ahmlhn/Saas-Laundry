<?php

namespace App\Filament\Resources\Orders\Pages\Concerns;

use App\Domain\Orders\OrderWorkflowService;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Order;
use App\Models\User;
use Filament\Actions\Action;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Illuminate\Validation\ValidationException;

trait InteractsWithOrderWorkflow
{
    /**
     * @return array<int, Action>
     */
    protected function getOrderWorkflowActions(): array
    {
        return [
            Action::make('addPayment')
                ->label('Tambah Pembayaran')
                ->icon('heroicon-o-banknotes')
                ->color('success')
                ->form([
                    Select::make('quick_action')
                        ->label('Quick action')
                        ->options([
                            'full' => 'Lunasi semua sisa tagihan',
                            'half' => 'Bayar setengah sisa tagihan',
                            'fixed_10000' => 'Bayar Rp10.000',
                        ])
                        ->placeholder('Input nominal manual')
                        ->native(false),
                    TextInput::make('amount')
                        ->label('Nominal')
                        ->numeric()
                        ->minValue(1)
                        ->placeholder('Kosongkan jika pakai quick action'),
                    TextInput::make('method')
                        ->label('Metode pembayaran')
                        ->default('cash')
                        ->required()
                        ->maxLength(30),
                    DateTimePicker::make('paid_at')
                        ->label('Waktu bayar')
                        ->seconds(false),
                    Textarea::make('notes')
                        ->label('Catatan')
                        ->rows(3),
                ])
                ->action(function (array $data): void {
                    $service = app(OrderWorkflowService::class);
                    $tenant = TenantPanelAccess::tenant();
                    $user = TenantPanelAccess::user();

                    abort_unless($tenant && $user instanceof User, 403);

                    $service->addPayment($this->record, $user, $tenant, $data, request());
                    $this->record->refresh();

                    Notification::make()
                        ->title('Pembayaran berhasil ditambahkan.')
                        ->success()
                        ->send();
                }),
            Action::make('updateLaundryStatus')
                ->label('Status Laundry')
                ->icon('heroicon-o-sparkles')
                ->color('warning')
                ->form([
                    Select::make('laundry_status')
                        ->label('Status target')
                        ->options($this->laundryStatusOptions())
                        ->required()
                        ->default(fn (): ?string => (string) $this->record->laundry_status)
                        ->native(false),
                ])
                ->action(function (array $data): void {
                    $service = app(OrderWorkflowService::class);
                    $tenant = TenantPanelAccess::tenant();
                    $user = TenantPanelAccess::user();

                    abort_unless($tenant && $user instanceof User, 403);

                    $result = $service->updateLaundryStatus(
                        order: $this->record,
                        user: $user,
                        tenant: $tenant,
                        targetStatus: (string) $data['laundry_status'],
                        request: request(),
                        actionKey: 'filament-laundry-update',
                    );

                    if (! $result['updated']) {
                        throw ValidationException::withMessages([
                            'laundry_status' => [$result['reason_label']],
                        ]);
                    }

                    $this->record->refresh();

                    Notification::make()
                        ->title('Status laundry diperbarui.')
                        ->success()
                        ->send();
                }),
            Action::make('updateCourierStatus')
                ->label('Status Kurir')
                ->icon('heroicon-o-truck')
                ->color('info')
                ->visible(fn (): bool => (bool) $this->record->is_pickup_delivery)
                ->form([
                    Select::make('courier_status')
                        ->label('Status target')
                        ->options($this->courierStatusOptions())
                        ->required()
                        ->default(fn (): ?string => (string) $this->record->courier_status)
                        ->native(false),
                ])
                ->action(function (array $data): void {
                    $service = app(OrderWorkflowService::class);
                    $tenant = TenantPanelAccess::tenant();
                    $user = TenantPanelAccess::user();

                    abort_unless($tenant && $user instanceof User, 403);

                    $result = $service->updateCourierStatus(
                        order: $this->record,
                        user: $user,
                        tenant: $tenant,
                        targetStatus: (string) $data['courier_status'],
                        request: request(),
                        actionKey: 'filament-courier-update',
                    );

                    if (! $result['updated']) {
                        throw ValidationException::withMessages([
                            'courier_status' => [$result['reason_label']],
                        ]);
                    }

                    $this->record->refresh();

                    Notification::make()
                        ->title('Status kurir diperbarui.')
                        ->success()
                        ->send();
                }),
            Action::make('assignCourier')
                ->label('Assign Kurir')
                ->icon('heroicon-o-user-plus')
                ->visible(fn (): bool => (bool) $this->record->is_pickup_delivery)
                ->form([
                    Select::make('courier_user_id')
                        ->label('Kurir')
                        ->options($this->courierOptions())
                        ->required()
                        ->native(false)
                        ->searchable()
                        ->default(fn (): ?int => $this->record->courier_user_id ? (int) $this->record->courier_user_id : null),
                ])
                ->action(function (array $data): void {
                    $service = app(OrderWorkflowService::class);
                    $tenant = TenantPanelAccess::tenant();
                    $user = TenantPanelAccess::user();

                    abort_unless($tenant && $user instanceof User, 403);

                    $courierUserId = (int) $data['courier_user_id'];
                    $courier = User::query()
                        ->with('roles:id,key')
                        ->where('tenant_id', $tenant->id)
                        ->where('status', 'active')
                        ->where('id', $courierUserId)
                        ->first();

                    $result = $service->assignCourier(
                        order: $this->record,
                        user: $user,
                        tenant: $tenant,
                        targetCourier: $courier,
                        courierUserId: $courierUserId,
                        request: request(),
                        actionKey: 'filament-courier-assign',
                    );

                    if (! $result['updated']) {
                        throw ValidationException::withMessages([
                            'courier_user_id' => [$result['reason_label']],
                        ]);
                    }

                    $this->record->refresh();

                    Notification::make()
                        ->title('Kurir berhasil ditetapkan.')
                        ->success()
                        ->send();
                }),
            Action::make('receipt')
                ->label('Nota')
                ->icon('heroicon-o-printer')
                ->url(fn (): string => route('tenant.orders.receipt', $this->record))
                ->openUrlInNewTab(),
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function laundryStatusOptions(): array
    {
        return [
            'received' => 'Received',
            'washing' => 'Washing',
            'drying' => 'Drying',
            'ironing' => 'Ironing',
            'ready' => 'Ready',
            'completed' => 'Completed',
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function courierStatusOptions(): array
    {
        return [
            'pickup_pending' => 'Pickup pending',
            'pickup_on_the_way' => 'Pickup on the way',
            'picked_up' => 'Picked up',
            'at_outlet' => 'At outlet',
            'delivery_pending' => 'Delivery pending',
            'delivery_on_the_way' => 'Delivery on the way',
            'delivered' => 'Delivered',
        ];
    }

    /**
     * @return array<int, string>
     */
    protected function courierOptions(): array
    {
        $tenant = TenantPanelAccess::tenant();
        $user = TenantPanelAccess::user();

        if (! $tenant || ! $user instanceof User) {
            return [];
        }

        return collect(app(OrderWorkflowService::class)->courierOptionsFor($user, $tenant, (string) $this->record->outlet_id))
            ->mapWithKeys(fn (array $courier): array => [
                $courier['id'] => $courier['name'],
            ])
            ->all();
    }
}
