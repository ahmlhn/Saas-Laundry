<?php

namespace App\Filament\Resources\OutletServices;

use App\Filament\Resources\OutletServices\Pages\CreateOutletService;
use App\Filament\Resources\OutletServices\Pages\EditOutletService;
use App\Filament\Resources\OutletServices\Pages\ListOutletServices;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Outlet;
use App\Models\OutletService;
use App\Models\Service;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
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

class OutletServiceResource extends Resource
{
    protected static ?string $model = OutletService::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedAdjustmentsHorizontal;

    protected static ?string $navigationLabel = 'Layanan Outlet';

    protected static ?string $modelLabel = 'layanan outlet';

    protected static ?string $pluralModelLabel = 'layanan outlet';

    protected static string|UnitEnum|null $navigationGroup = 'Operasional';

    protected static ?int $navigationSort = 50;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Override layanan outlet')
                    ->schema([
                        Select::make('outlet_id')
                            ->label('Outlet')
                            ->options(fn (): array => TenantPanelAccess::assignableOutletOptions())
                            ->required()
                            ->searchable()
                            ->preload(),
                        Select::make('service_id')
                            ->label('Layanan')
                            ->options(fn (): array => Service::query()
                                ->where('tenant_id', TenantPanelAccess::tenantId())
                                ->orderBy('name')
                                ->get(['id', 'name', 'unit_type', 'base_price_amount'])
                                ->mapWithKeys(fn (Service $service): array => [
                                    (string) $service->id => sprintf(
                                        '%s (%s) - Rp%s',
                                        $service->name,
                                        $service->unit_type,
                                        number_format((int) $service->base_price_amount, 0, ',', '.'),
                                    ),
                                ])
                                ->all())
                            ->required()
                            ->searchable()
                            ->preload(),
                        Toggle::make('active')
                            ->label('Aktif')
                            ->default(true),
                        TextInput::make('price_override_amount')
                            ->label('Harga override')
                            ->numeric()
                            ->minValue(0)
                            ->placeholder('Kosong = harga dasar'),
                        TextInput::make('sla_override')
                            ->label('SLA override')
                            ->maxLength(100)
                            ->placeholder('Contoh: 24 jam'),
                    ])
                    ->columns(2),
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
                TextColumn::make('service.name')
                    ->label('Layanan')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('service.unit_type')
                    ->label('Unit')
                    ->badge(),
                IconColumn::make('service.active')
                    ->label('Layanan aktif')
                    ->boolean(),
                TextColumn::make('service.base_price_amount')
                    ->label('Harga dasar')
                    ->formatStateUsing(fn ($state): string => 'Rp '.number_format((int) $state, 0, ',', '.'))
                    ->sortable(),
                TextColumn::make('price_override_amount')
                    ->label('Override')
                    ->formatStateUsing(fn ($state): string => $state === null ? 'Harga dasar' : 'Rp '.number_format((int) $state, 0, ',', '.')),
                TextColumn::make('sla_override')
                    ->label('SLA')
                    ->placeholder('-'),
                IconColumn::make('active')
                    ->label('Aktif')
                    ->boolean(),
                TextColumn::make('updated_at')
                    ->label('Update')
                    ->since()
                    ->sortable(),
            ])
            ->filters([
                SelectFilter::make('outlet_id')
                    ->label('Outlet')
                    ->options(fn (): array => TenantPanelAccess::assignableOutletOptions()),
                TernaryFilter::make('active')
                    ->label('Status override'),
                TernaryFilter::make('service_active')
                    ->label('Status layanan')
                    ->queries(
                        true: fn (Builder $query) => $query->whereHas('service', fn (Builder $serviceQuery) => $serviceQuery->where('active', true)),
                        false: fn (Builder $query) => $query->whereHas('service', fn (Builder $serviceQuery) => $serviceQuery->where('active', false)),
                        blank: fn (Builder $query) => $query,
                    ),
                SelectFilter::make('override_price')
                    ->label('Harga override')
                    ->options([
                        'has' => 'Ada override',
                        'none' => 'Tanpa override',
                    ])
                    ->query(function (Builder $query, array $data): Builder {
                        return match ($data['value'] ?? null) {
                            'has' => $query->whereNotNull('price_override_amount'),
                            'none' => $query->whereNull('price_override_amount'),
                            default => $query,
                        };
                    }),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ])
            ->defaultSort('updated_at', 'desc');
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListOutletServices::route('/'),
            'create' => CreateOutletService::route('/create'),
            'edit' => EditOutletService::route('/{record}/edit'),
        ];
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()
            ->with([
                'outlet:id,name,code,tenant_id',
                'service:id,tenant_id,name,unit_type,base_price_amount,active',
            ])
            ->whereHas('outlet', fn (Builder $builder) => $builder->where('tenant_id', TenantPanelAccess::tenantId()))
            ->whereHas('service', fn (Builder $builder) => $builder->where('tenant_id', TenantPanelAccess::tenantId()));

        if (! TenantPanelAccess::isOwner()) {
            $query->whereIn('outlet_id', TenantPanelAccess::allowedOutletIds());
        }

        return $query;
    }
}
