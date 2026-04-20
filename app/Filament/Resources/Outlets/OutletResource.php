<?php

namespace App\Filament\Resources\Outlets;

use App\Filament\Resources\Outlets\Pages\CreateOutlet;
use App\Filament\Resources\Outlets\Pages\EditOutlet;
use App\Filament\Resources\Outlets\Pages\ListOutlets;
use App\Filament\Resources\Outlets\Pages\ViewOutlet;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Outlet;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Actions\ForceDeleteAction;
use Filament\Actions\ForceDeleteBulkAction;
use Filament\Actions\RestoreAction;
use Filament\Actions\RestoreBulkAction;
use Filament\Actions\ViewAction;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TrashedFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletingScope;
use UnitEnum;

class OutletResource extends Resource
{
    protected static ?string $model = Outlet::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBuildingStorefront;

    protected static ?string $navigationLabel = 'Outlet';

    protected static ?string $modelLabel = 'outlet';

    protected static ?string $pluralModelLabel = 'outlet';

    protected static string|UnitEnum|null $navigationGroup = 'Master Data';

    protected static ?int $navigationSort = 30;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Profil outlet')
                    ->schema([
                        Hidden::make('tenant_id')
                            ->default(fn (): ?string => TenantPanelAccess::tenantId()),
                        TextInput::make('name')
                            ->label('Nama outlet')
                            ->required()
                            ->maxLength(255),
                        TextInput::make('code')
                            ->label('Kode')
                            ->required()
                            ->maxLength(8),
                        TextInput::make('timezone')
                            ->label('Timezone')
                            ->required()
                            ->default('Asia/Jakarta')
                            ->maxLength(255),
                        Textarea::make('address')
                            ->label('Alamat')
                            ->rows(4)
                            ->columnSpanFull(),
                    ])
                    ->columns(3),
            ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Ringkasan outlet')
                    ->schema([
                        TextEntry::make('name')
                            ->label('Nama outlet'),
                        TextEntry::make('code')
                            ->label('Kode'),
                        TextEntry::make('timezone')
                            ->label('Timezone'),
                        TextEntry::make('orders_count')
                            ->label('Total order'),
                        TextEntry::make('shipping_zones_count')
                            ->label('Zona kirim'),
                        TextEntry::make('address')
                            ->label('Alamat')
                            ->placeholder('-')
                            ->columnSpanFull(),
                        TextEntry::make('deleted_at')
                            ->label('Diarsipkan')
                            ->dateTime('d M Y H:i')
                            ->placeholder('-'),
                    ])
                    ->columns(3),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query
                ->withCount(['orders', 'shippingZones'])
            )
            ->columns([
                TextColumn::make('name')
                    ->label('Outlet')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('code')
                    ->label('Kode')
                    ->badge()
                    ->searchable(),
                TextColumn::make('timezone')
                    ->label('Timezone')
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('orders_count')
                    ->label('Order')
                    ->badge()
                    ->sortable(),
                TextColumn::make('shipping_zones_count')
                    ->label('Zona')
                    ->badge(),
                TextColumn::make('updated_at')
                    ->label('Update')
                    ->since()
                    ->sortable(),
                TextColumn::make('deleted_at')
                    ->label('Arsip')
                    ->dateTime('d M Y H:i')
                    ->placeholder('-')
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                TrashedFilter::make(),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make()
                    ->visible(fn (): bool => TenantPanelAccess::isOwner()),
                DeleteAction::make()
                    ->visible(fn (): bool => TenantPanelAccess::isOwner()),
                RestoreAction::make()
                    ->visible(fn (): bool => TenantPanelAccess::isOwner()),
                ForceDeleteAction::make()
                    ->visible(fn (): bool => TenantPanelAccess::isOwner()),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make()
                        ->visible(fn (): bool => TenantPanelAccess::isOwner()),
                    RestoreBulkAction::make()
                        ->visible(fn (): bool => TenantPanelAccess::isOwner()),
                    ForceDeleteBulkAction::make()
                        ->visible(fn (): bool => TenantPanelAccess::isOwner()),
                ]),
            ])
            ->defaultSort('name');
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListOutlets::route('/'),
            'create' => CreateOutlet::route('/create'),
            'view' => ViewOutlet::route('/{record}'),
            'edit' => EditOutlet::route('/{record}/edit'),
        ];
    }

    public static function canCreate(): bool
    {
        return TenantPanelAccess::isOwner();
    }

    public static function canEdit(Model $record): bool
    {
        return TenantPanelAccess::isOwner();
    }

    public static function canDelete(Model $record): bool
    {
        return TenantPanelAccess::isOwner();
    }

    public static function canRestore(Model $record): bool
    {
        return TenantPanelAccess::isOwner();
    }

    public static function canForceDelete(Model $record): bool
    {
        return TenantPanelAccess::isOwner();
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()
            ->where('tenant_id', TenantPanelAccess::tenantId());

        if (! TenantPanelAccess::isOwner()) {
            $query->whereIn('id', TenantPanelAccess::allowedOutletIds());
        }

        return $query;
    }

    public static function getRecordRouteBindingEloquentQuery(): Builder
    {
        return static::getEloquentQuery()
            ->withoutGlobalScopes([
                SoftDeletingScope::class,
            ]);
    }
}
