<?php

namespace App\Filament\Resources\Services;

use App\Filament\Resources\Services\Pages\CreateService;
use App\Filament\Resources\Services\Pages\EditService;
use App\Filament\Resources\Services\Pages\ListServices;
use App\Filament\Resources\Services\Pages\ViewService;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Service;
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
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Filters\TrashedFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;
use UnitEnum;

class ServiceResource extends Resource
{
    protected static ?string $model = Service::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedTag;

    protected static ?string $navigationLabel = 'Layanan';

    protected static ?string $modelLabel = 'layanan';

    protected static ?string $pluralModelLabel = 'layanan';

    protected static string|UnitEnum|null $navigationGroup = 'Master Data';

    protected static ?int $navigationSort = 20;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Identitas layanan')
                    ->schema([
                        Hidden::make('tenant_id')
                            ->default(fn (): ?string => TenantPanelAccess::tenantId()),
                        TextInput::make('name')
                            ->label('Nama')
                            ->required()
                            ->maxLength(255),
                        Select::make('service_type')
                            ->label('Tipe layanan')
                            ->options([
                                'regular' => 'Regular',
                                'package' => 'Paket',
                                'perfume' => 'Parfum',
                                'item' => 'Item',
                            ])
                            ->default('regular')
                            ->required(),
                        Select::make('parent_service_id')
                            ->label('Parent layanan')
                            ->options(fn (): array => Service::query()
                                ->where('tenant_id', TenantPanelAccess::tenantId())
                                ->orderBy('name')
                                ->pluck('name', 'id')
                                ->all())
                            ->searchable()
                            ->preload(),
                        Toggle::make('is_group')
                            ->label('Grup layanan')
                            ->default(false),
                        Select::make('unit_type')
                            ->label('Unit hitung')
                            ->options([
                                'kg' => 'Kg',
                                'pcs' => 'Pcs',
                                'satuan' => 'Satuan',
                            ])
                            ->default('pcs')
                            ->required(),
                        Select::make('display_unit')
                            ->label('Unit tampil')
                            ->options([
                                'kg' => 'Kg',
                                'pcs' => 'Pcs',
                                'satuan' => 'Satuan',
                            ])
                            ->default('pcs')
                            ->required(),
                    ])
                    ->columns(2),
                Section::make('Harga dan SLA')
                    ->schema([
                        TextInput::make('base_price_amount')
                            ->label('Harga dasar')
                            ->numeric()
                            ->required()
                            ->default(0)
                            ->minValue(0),
                        TextInput::make('duration_days')
                            ->label('Durasi hari')
                            ->numeric()
                            ->minValue(0),
                        TextInput::make('duration_hours')
                            ->label('Durasi jam')
                            ->numeric()
                            ->default(0)
                            ->minValue(0)
                            ->maxValue(23),
                        TextInput::make('sort_order')
                            ->label('Urutan')
                            ->numeric()
                            ->default(0),
                        TextInput::make('package_quota_value')
                            ->label('Kuota paket')
                            ->numeric()
                            ->minValue(0),
                        Select::make('package_quota_unit')
                            ->label('Unit kuota paket')
                            ->options([
                                'kg' => 'Kg',
                                'pcs' => 'Pcs',
                            ]),
                        TextInput::make('package_valid_days')
                            ->label('Masa aktif paket')
                            ->numeric()
                            ->minValue(0),
                        Select::make('package_accumulation_mode')
                            ->label('Mode akumulasi')
                            ->options([
                                'accumulative' => 'Akumulatif',
                                'fixed_window' => 'Jendela tetap',
                            ]),
                    ])
                    ->columns(4),
                Section::make('Visibilitas')
                    ->schema([
                        Toggle::make('active')
                            ->label('Aktif')
                            ->default(true),
                        Toggle::make('show_in_cashier')
                            ->label('Tampil di kasir')
                            ->default(true),
                        Toggle::make('show_to_customer')
                            ->label('Tampil ke pelanggan')
                            ->default(true),
                        TextInput::make('image_icon')
                            ->label('Ikon')
                            ->maxLength(80),
                    ])
                    ->columns(4),
            ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Ringkasan layanan')
                    ->schema([
                        TextEntry::make('name')
                            ->label('Nama'),
                        TextEntry::make('service_type')
                            ->label('Tipe')
                            ->badge(),
                        TextEntry::make('parent.name')
                            ->label('Parent')
                            ->placeholder('-'),
                        TextEntry::make('unit_type')
                            ->label('Unit hitung'),
                        TextEntry::make('display_unit')
                            ->label('Unit tampil'),
                        TextEntry::make('base_price_amount')
                            ->label('Harga dasar')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('duration_days')
                            ->label('Durasi hari')
                            ->placeholder('-'),
                        TextEntry::make('duration_hours')
                            ->label('Durasi jam')
                            ->placeholder('-'),
                        TextEntry::make('package_quota_value')
                            ->label('Kuota paket')
                            ->placeholder('-'),
                        TextEntry::make('package_quota_unit')
                            ->label('Unit kuota')
                            ->placeholder('-'),
                        TextEntry::make('package_valid_days')
                            ->label('Masa aktif paket')
                            ->placeholder('-'),
                        TextEntry::make('package_accumulation_mode')
                            ->label('Mode akumulasi')
                            ->placeholder('-'),
                        TextEntry::make('active')
                            ->label('Aktif')
                            ->badge()
                            ->formatStateUsing(fn (bool $state): string => $state ? 'Ya' : 'Tidak'),
                        TextEntry::make('show_in_cashier')
                            ->label('Kasir')
                            ->badge()
                            ->formatStateUsing(fn (bool $state): string => $state ? 'Tampil' : 'Sembunyi'),
                        TextEntry::make('show_to_customer')
                            ->label('Pelanggan')
                            ->badge()
                            ->formatStateUsing(fn (bool $state): string => $state ? 'Tampil' : 'Sembunyi'),
                        TextEntry::make('sort_order')
                            ->label('Urutan'),
                        TextEntry::make('image_icon')
                            ->label('Ikon')
                            ->placeholder('-'),
                    ])
                    ->columns(4),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->label('Nama')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('service_type')
                    ->label('Tipe')
                    ->badge(),
                TextColumn::make('unit_type')
                    ->label('Unit'),
                TextColumn::make('base_price_amount')
                    ->label('Harga')
                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.'))
                    ->sortable(),
                IconColumn::make('active')
                    ->label('Aktif')
                    ->boolean(),
                IconColumn::make('show_in_cashier')
                    ->label('Kasir')
                    ->boolean()
                    ->toggleable(isToggledHiddenByDefault: true),
                IconColumn::make('show_to_customer')
                    ->label('Pelanggan')
                    ->boolean()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('sort_order')
                    ->label('Urutan')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('deleted_at')
                    ->label('Arsip')
                    ->dateTime('d M Y H:i')
                    ->placeholder('-')
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                SelectFilter::make('service_type')
                    ->label('Tipe layanan')
                    ->options([
                        'regular' => 'Regular',
                        'package' => 'Paket',
                        'perfume' => 'Parfum',
                        'item' => 'Item',
                    ]),
                TernaryFilter::make('active')
                    ->label('Status aktif'),
                TrashedFilter::make(),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make(),
                DeleteAction::make(),
                RestoreAction::make(),
                ForceDeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                    RestoreBulkAction::make(),
                    ForceDeleteBulkAction::make(),
                ]),
            ])
            ->defaultSort('sort_order')
            ->defaultSort('name');
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListServices::route('/'),
            'create' => CreateService::route('/create'),
            'view' => ViewService::route('/{record}'),
            'edit' => EditService::route('/{record}/edit'),
        ];
    }

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->with(['parent:id,name'])
            ->where('tenant_id', TenantPanelAccess::tenantId());
    }

    public static function getRecordRouteBindingEloquentQuery(): Builder
    {
        return static::getEloquentQuery()
            ->withoutGlobalScopes([
                SoftDeletingScope::class,
            ]);
    }
}
