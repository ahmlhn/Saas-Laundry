<?php

namespace App\Filament\Resources\ShippingZones;

use App\Filament\Resources\ShippingZones\Pages\CreateShippingZone;
use App\Filament\Resources\ShippingZones\Pages\EditShippingZone;
use App\Filament\Resources\ShippingZones\Pages\ListShippingZones;
use App\Filament\Resources\ShippingZones\Pages\ViewShippingZone;
use App\Filament\Support\TenantPanelAccess;
use App\Models\ShippingZone;
use BackedEnum;
use Filament\Actions\EditAction;
use Filament\Actions\ViewAction;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
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
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class ShippingZoneResource extends Resource
{
    protected static ?string $model = ShippingZone::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedMap;

    protected static ?string $navigationLabel = 'Zona Kirim';

    protected static ?string $modelLabel = 'zona kirim';

    protected static ?string $pluralModelLabel = 'zona kirim';

    protected static string|UnitEnum|null $navigationGroup = 'Operasional';

    protected static ?int $navigationSort = 40;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Aturan zona kirim')
                    ->schema([
                        Hidden::make('tenant_id')
                            ->default(fn (): ?string => TenantPanelAccess::tenantId()),
                        Select::make('outlet_id')
                            ->label('Outlet')
                            ->options(fn (): array => TenantPanelAccess::assignableOutletOptions())
                            ->required()
                            ->searchable()
                            ->preload(),
                        TextInput::make('name')
                            ->label('Nama zona')
                            ->required()
                            ->maxLength(120),
                        TextInput::make('min_distance_km')
                            ->label('Jarak minimum (km)')
                            ->numeric()
                            ->minValue(0),
                        TextInput::make('max_distance_km')
                            ->label('Jarak maksimum (km)')
                            ->numeric()
                            ->minValue(0),
                        TextInput::make('fee_amount')
                            ->label('Biaya antar')
                            ->numeric()
                            ->required()
                            ->default(0)
                            ->minValue(0),
                        TextInput::make('eta_minutes')
                            ->label('ETA (menit)')
                            ->numeric()
                            ->minValue(0),
                        Toggle::make('active')
                            ->label('Aktif')
                            ->default(true),
                        Textarea::make('notes')
                            ->label('Catatan')
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
                Section::make('Detail zona')
                    ->schema([
                        TextEntry::make('outlet.name')
                            ->label('Outlet'),
                        TextEntry::make('name')
                            ->label('Nama zona'),
                        TextEntry::make('active')
                            ->label('Status')
                            ->badge()
                            ->formatStateUsing(fn (bool $state): string => $state ? 'Aktif' : 'Nonaktif'),
                        TextEntry::make('min_distance_km')
                            ->label('Min km')
                            ->placeholder('-'),
                        TextEntry::make('max_distance_km')
                            ->label('Max km')
                            ->placeholder('-'),
                        TextEntry::make('fee_amount')
                            ->label('Biaya')
                            ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.')),
                        TextEntry::make('eta_minutes')
                            ->label('ETA menit')
                            ->placeholder('-'),
                        TextEntry::make('notes')
                            ->label('Catatan')
                            ->placeholder('-')
                            ->columnSpanFull(),
                    ])
                    ->columns(3),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('outlet.name')
                    ->label('Outlet')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('name')
                    ->label('Zona')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('min_distance_km')
                    ->label('Min km')
                    ->placeholder('-'),
                TextColumn::make('max_distance_km')
                    ->label('Max km')
                    ->placeholder('-'),
                TextColumn::make('fee_amount')
                    ->label('Biaya')
                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.'))
                    ->sortable(),
                TextColumn::make('eta_minutes')
                    ->label('ETA')
                    ->suffix(' menit')
                    ->placeholder('-'),
                IconColumn::make('active')
                    ->label('Aktif')
                    ->boolean(),
            ])
            ->filters([
                SelectFilter::make('outlet_id')
                    ->label('Outlet')
                    ->options(fn (): array => TenantPanelAccess::assignableOutletOptions()),
                TernaryFilter::make('active')
                    ->label('Status aktif'),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make(),
            ])
            ->defaultSort('outlet.name')
            ->defaultSort('name');
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListShippingZones::route('/'),
            'create' => CreateShippingZone::route('/create'),
            'view' => ViewShippingZone::route('/{record}'),
            'edit' => EditShippingZone::route('/{record}/edit'),
        ];
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()
            ->with(['outlet:id,name,tenant_id'])
            ->where('tenant_id', TenantPanelAccess::tenantId());

        if (! TenantPanelAccess::isOwner()) {
            $query->whereIn('outlet_id', TenantPanelAccess::allowedOutletIds());
        }

        return $query;
    }
}
