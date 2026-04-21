<?php

namespace App\Filament\Resources\Orders;

use App\Domain\Orders\OrderWorkflowService;
use App\Filament\Resources\Orders\Pages\EditOrder;
use App\Filament\Resources\Orders\Pages\ListOrders;
use App\Filament\Resources\Orders\Pages\ViewOrder;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Order;
use App\Models\User;
use BackedEnum;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\EditAction;
use Filament\Actions\ViewAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Infolists\Components\KeyValueEntry;
use Filament\Infolists\Components\RepeatableEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Eloquent\Model;
use UnitEnum;

class OrderResource extends Resource
{
    protected static ?string $model = Order::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedShoppingBag;

    protected static ?string $navigationLabel = 'Order';

    protected static ?string $modelLabel = 'order';

    protected static ?string $pluralModelLabel = 'order';

    protected static string|UnitEnum|null $navigationGroup = 'Operasional';

    protected static ?int $navigationSort = 10;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Status operasional')
                    ->schema([
                        Select::make('laundry_status')
                            ->label('Status laundry')
                            ->options([
                                'received' => 'Received',
                                'washing' => 'Washing',
                                'drying' => 'Drying',
                                'ironing' => 'Ironing',
                                'ready' => 'Ready',
                                'completed' => 'Completed',
                            ])
                            ->required(),
                        Select::make('courier_status')
                            ->label('Status kurir')
                            ->options([
                                'pickup_pending' => 'Pickup pending',
                                'pickup_on_the_way' => 'Pickup on the way',
                                'picked_up' => 'Picked up',
                                'at_outlet' => 'At outlet',
                                'delivery_pending' => 'Delivery pending',
                                'delivery_on_the_way' => 'Delivery on the way',
                                'delivered' => 'Delivered',
                            ]),
                        Select::make('courier_user_id')
                            ->label('Kurir')
                            ->options(fn (): array => User::query()
                                ->where('tenant_id', TenantPanelAccess::tenantId())
                                ->where('status', 'active')
                                ->whereHas('roles', fn (Builder $builder) => $builder->where('key', 'courier'))
                                ->when(
                                    ! TenantPanelAccess::isOwner(),
                                    fn (Builder $builder) => $builder->whereHas(
                                        'outlets',
                                        fn (Builder $outlets) => $outlets->whereIn('outlets.id', TenantPanelAccess::allowedOutletIds()),
                                    ),
                                )
                                ->orderBy('name')
                                ->pluck('name', 'id')
                                ->all())
                            ->searchable()
                            ->preload(),
                    ])
                    ->columns(3),
                Section::make('Penagihan dan catatan')
                    ->schema([
                        Select::make('collection_status')
                            ->label('Status penagihan')
                            ->options([
                                'pending' => 'Pending',
                                'contacted' => 'Contacted',
                                'promise_to_pay' => 'Promise to pay',
                                'escalated' => 'Escalated',
                                'resolved' => 'Resolved',
                            ]),
                        DateTimePicker::make('collection_last_contacted_at')
                            ->label('Kontak terakhir'),
                        DateTimePicker::make('collection_next_follow_up_at')
                            ->label('Follow up berikutnya'),
                        Textarea::make('collection_note')
                            ->label('Catatan penagihan')
                            ->rows(3)
                            ->columnSpanFull(),
                        Textarea::make('notes')
                            ->label('Catatan order')
                            ->rows(4)
                            ->columnSpanFull(),
                        Textarea::make('cancelled_reason')
                            ->label('Alasan batal')
                            ->rows(3)
                            ->columnSpanFull(),
                    ])
                    ->columns(3),
            ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Header order')
                    ->schema([
                        TextEntry::make('order_code')
                            ->label('Kode order'),
                        TextEntry::make('invoice_no')
                            ->label('Invoice')
                            ->placeholder('-'),
                        TextEntry::make('tracking_token')
                            ->label('Tracking token')
                            ->copyable(),
                        TextEntry::make('customer.name')
                            ->label('Pelanggan'),
                        TextEntry::make('customer.phone_normalized')
                            ->label('No. pelanggan')
                            ->placeholder('-'),
                        TextEntry::make('outlet.name')
                            ->label('Outlet'),
                        TextEntry::make('courier.name')
                            ->label('Kurir')
                            ->placeholder('-'),
                        TextEntry::make('laundry_status')
                            ->label('Laundry')
                            ->badge(),
                        TextEntry::make('courier_status')
                            ->label('Kurir status')
                            ->badge()
                            ->placeholder('-'),
                    ])
                    ->columns(3),
                Section::make('Nilai transaksi')
                    ->schema([
                        TextEntry::make('total_amount')
                            ->label('Total')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('paid_amount')
                            ->label('Dibayar')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('due_amount')
                            ->label('Sisa')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('discount_amount')
                            ->label('Diskon')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('shipping_fee_amount')
                            ->label('Ongkir')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('source_channel')
                            ->label('Channel')
                            ->badge(),
                    ])
                    ->columns(3),
                Section::make('Pickup dan delivery')
                    ->schema([
                        TextEntry::make('requires_pickup')
                            ->label('Pickup')
                            ->badge()
                            ->formatStateUsing(fn (bool $state): string => $state ? 'Ya' : 'Tidak'),
                        TextEntry::make('requires_delivery')
                            ->label('Delivery')
                            ->badge()
                            ->formatStateUsing(fn (bool $state): string => $state ? 'Ya' : 'Tidak'),
                        KeyValueEntry::make('pickup')
                            ->label('Data pickup')
                            ->columnSpanFull(),
                        KeyValueEntry::make('delivery')
                            ->label('Data delivery')
                            ->columnSpanFull(),
                    ])
                    ->columns(2),
                Section::make('Item order')
                    ->schema([
                        RepeatableEntry::make('items')
                            ->label('')
                            ->schema([
                                TextEntry::make('service_name_snapshot')
                                    ->label('Layanan'),
                                TextEntry::make('unit_type_snapshot')
                                    ->label('Unit'),
                                TextEntry::make('qty')
                                    ->label('Qty')
                                    ->placeholder('-'),
                                TextEntry::make('weight_kg')
                                    ->label('Kg')
                                    ->placeholder('-'),
                                TextEntry::make('unit_price_amount')
                                    ->label('Harga')
                                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                                TextEntry::make('subtotal_amount')
                                    ->label('Subtotal')
                                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                            ])
                            ->columns(3),
                    ]),
                Section::make('Pembayaran')
                    ->schema([
                        RepeatableEntry::make('payments')
                            ->label('')
                            ->schema([
                                TextEntry::make('amount')
                                    ->label('Nominal')
                                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                                TextEntry::make('method')
                                    ->label('Metode')
                                    ->badge(),
                                TextEntry::make('paid_at')
                                    ->label('Tanggal bayar')
                                    ->dateTime('d M Y H:i'),
                                TextEntry::make('notes')
                                    ->label('Catatan')
                                    ->placeholder('-'),
                            ])
                            ->columns(2),
                    ]),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('order_code')
                    ->label('Kode')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('invoice_no')
                    ->label('Invoice')
                    ->searchable()
                    ->placeholder('-'),
                TextColumn::make('customer.name')
                    ->label('Pelanggan')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('outlet.name')
                    ->label('Outlet')
                    ->sortable(),
                TextColumn::make('total_amount')
                    ->label('Total')
                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.'))
                    ->sortable(),
                TextColumn::make('laundry_status')
                    ->label('Laundry')
                    ->badge(),
                TextColumn::make('courier_status')
                    ->label('Kurir')
                    ->badge()
                    ->placeholder('-'),
                TextColumn::make('collection_status')
                    ->label('Tagih')
                    ->badge()
                    ->placeholder('-')
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('created_at')
                    ->label('Masuk')
                    ->dateTime('d M Y H:i')
                    ->sortable(),
            ])
            ->filters([
                SelectFilter::make('outlet_id')
                    ->label('Outlet')
                    ->options(fn (): array => TenantPanelAccess::assignableOutletOptions()),
                SelectFilter::make('laundry_status')
                    ->options([
                        'received' => 'Received',
                        'washing' => 'Washing',
                        'drying' => 'Drying',
                        'ironing' => 'Ironing',
                        'ready' => 'Ready',
                        'completed' => 'Completed',
                    ]),
                SelectFilter::make('courier_status')
                    ->options([
                        'pickup_pending' => 'Pickup pending',
                        'pickup_on_the_way' => 'Pickup on the way',
                        'picked_up' => 'Picked up',
                        'at_outlet' => 'At outlet',
                        'delivery_pending' => 'Delivery pending',
                        'delivery_on_the_way' => 'Delivery on the way',
                        'delivered' => 'Delivered',
                    ]),
                SelectFilter::make('collection_status')
                    ->options([
                        'pending' => 'Pending',
                        'contacted' => 'Contacted',
                        'promise_to_pay' => 'Promise to pay',
                        'escalated' => 'Escalated',
                        'resolved' => 'Resolved',
                    ]),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    static::makeLaundryBulkAction(
                        name: 'markReady',
                        label: 'Bulk Ready',
                        targetStatus: 'ready',
                        actionKey: 'filament-bulk-mark-ready',
                        color: 'warning',
                    ),
                    static::makeLaundryBulkAction(
                        name: 'markCompleted',
                        label: 'Bulk Completed',
                        targetStatus: 'completed',
                        actionKey: 'filament-bulk-mark-completed',
                        color: 'success',
                    ),
                    static::makeCourierBulkAction(
                        name: 'bulkDeliveryPending',
                        label: 'Bulk Delivery Pending',
                        targetStatus: 'delivery_pending',
                        actionKey: 'filament-bulk-delivery-pending',
                    ),
                    static::makeCourierBulkAction(
                        name: 'bulkDeliveryOtw',
                        label: 'Bulk Delivery OTW',
                        targetStatus: 'delivery_on_the_way',
                        actionKey: 'filament-bulk-delivery-otw',
                    ),
                    static::makeCourierBulkAction(
                        name: 'bulkDelivered',
                        label: 'Bulk Delivered',
                        targetStatus: 'delivered',
                        actionKey: 'filament-bulk-delivered',
                        color: 'success',
                    ),
                    static::makeAssignCourierBulkAction(),
                ]),
            ])
            ->defaultSort('created_at', 'desc');
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListOrders::route('/'),
            'view' => ViewOrder::route('/{record}'),
            'edit' => EditOrder::route('/{record}/edit'),
        ];
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canDelete(Model $record): bool
    {
        return false;
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()
            ->with([
                'customer:id,name,phone_normalized',
                'outlet:id,name,code,tenant_id',
                'courier:id,name',
                'items:id,order_id,service_name_snapshot,unit_type_snapshot,qty,weight_kg,unit_price_amount,subtotal_amount',
                'payments:id,order_id,amount,method,paid_at,notes',
            ])
            ->where('tenant_id', TenantPanelAccess::tenantId());

        if (! TenantPanelAccess::isOwner()) {
            $query->whereIn('outlet_id', TenantPanelAccess::allowedOutletIds());
        }

        return $query;
    }

    protected static function makeLaundryBulkAction(
        string $name,
        string $label,
        string $targetStatus,
        string $actionKey,
        string $color = 'gray',
    ): BulkAction {
        return BulkAction::make($name)
            ->label($label)
            ->color($color)
            ->requiresConfirmation()
            ->action(function (EloquentCollection $records) use ($label, $targetStatus, $actionKey): void {
                [$tenant, $user] = static::tenantContext();
                $service = app(OrderWorkflowService::class);
                $updated = 0;
                $skipped = 0;
                $messages = [];

                foreach ($records as $record) {
                    /** @var Order $record */
                    $result = $service->updateLaundryStatus(
                        order: $record,
                        user: $user,
                        tenant: $tenant,
                        targetStatus: $targetStatus,
                        request: request(),
                        actionKey: $actionKey,
                        isBulkAction: true,
                    );

                    if ($result['updated']) {
                        $updated++;
                        continue;
                    }

                    $skipped++;
                    if (count($messages) < 3) {
                        $messages[] = static::bulkRecordLabel($record).': '.$result['reason_label'];
                    }
                }

                static::notifyBulkResult($label, $updated, $skipped, $messages);
            });
    }

    protected static function makeCourierBulkAction(
        string $name,
        string $label,
        string $targetStatus,
        string $actionKey,
        string $color = 'info',
    ): BulkAction {
        return BulkAction::make($name)
            ->label($label)
            ->color($color)
            ->requiresConfirmation()
            ->action(function (EloquentCollection $records) use ($label, $targetStatus, $actionKey): void {
                [$tenant, $user] = static::tenantContext();
                $service = app(OrderWorkflowService::class);
                $updated = 0;
                $skipped = 0;
                $messages = [];

                foreach ($records as $record) {
                    /** @var Order $record */
                    $result = $service->updateCourierStatus(
                        order: $record,
                        user: $user,
                        tenant: $tenant,
                        targetStatus: $targetStatus,
                        request: request(),
                        actionKey: $actionKey,
                        isBulkAction: true,
                    );

                    if ($result['updated']) {
                        $updated++;
                        continue;
                    }

                    $skipped++;
                    if (count($messages) < 3) {
                        $messages[] = static::bulkRecordLabel($record).': '.$result['reason_label'];
                    }
                }

                static::notifyBulkResult($label, $updated, $skipped, $messages);
            });
    }

    protected static function makeAssignCourierBulkAction(): BulkAction
    {
        return BulkAction::make('assignCourier')
            ->label('Bulk Assign Courier')
            ->color('gray')
            ->requiresConfirmation()
            ->form([
                Select::make('courier_user_id')
                    ->label('Kurir')
                    ->options(static::courierBulkOptions())
                    ->required()
                    ->native(false)
                    ->searchable(),
            ])
            ->action(function (EloquentCollection $records, array $data): void {
                [$tenant, $user] = static::tenantContext();
                $service = app(OrderWorkflowService::class);
                $courierUserId = (int) $data['courier_user_id'];
                $courier = User::query()
                    ->with('roles:id,key')
                    ->where('tenant_id', $tenant->id)
                    ->where('status', 'active')
                    ->where('id', $courierUserId)
                    ->first();

                $updated = 0;
                $skipped = 0;
                $messages = [];

                foreach ($records as $record) {
                    /** @var Order $record */
                    $result = $service->assignCourier(
                        order: $record,
                        user: $user,
                        tenant: $tenant,
                        targetCourier: $courier,
                        courierUserId: $courierUserId,
                        request: request(),
                        actionKey: 'filament-bulk-assign-courier',
                        isBulkAction: true,
                    );

                    if ($result['updated']) {
                        $updated++;
                        continue;
                    }

                    $skipped++;
                    if (count($messages) < 3) {
                        $messages[] = static::bulkRecordLabel($record).': '.$result['reason_label'];
                    }
                }

                static::notifyBulkResult('Bulk Assign Courier', $updated, $skipped, $messages);
            });
    }

    /**
     * @return array{0: \App\Models\Tenant, 1: \App\Models\User}
     */
    protected static function tenantContext(): array
    {
        $tenant = TenantPanelAccess::tenant();
        $user = TenantPanelAccess::user();

        abort_unless($tenant && $user instanceof User, 403);

        return [$tenant, $user];
    }

    /**
     * @return array<int, string>
     */
    protected static function courierBulkOptions(): array
    {
        [$tenant, $user] = static::tenantContext();

        return collect(app(OrderWorkflowService::class)->courierOptionsFor($user, $tenant))
            ->mapWithKeys(fn (array $courier): array => [
                $courier['id'] => $courier['name'],
            ])
            ->all();
    }

    protected static function bulkRecordLabel(Order $record): string
    {
        return (string) ($record->invoice_no ?: $record->order_code ?: $record->id);
    }

    /**
     * @param  array<int, string>  $messages
     */
    protected static function notifyBulkResult(string $label, int $updated, int $skipped, array $messages = []): void
    {
        $body = sprintf('Updated: %d. Skipped: %d.', $updated, $skipped);

        if ($messages !== []) {
            $body .= "\n".implode("\n", $messages);
        }

        $notification = Notification::make()
            ->title($label)
            ->body($body);

        if ($skipped === 0) {
            $notification->success();
        } else {
            $notification->warning();
        }

        $notification->send();
    }
}
