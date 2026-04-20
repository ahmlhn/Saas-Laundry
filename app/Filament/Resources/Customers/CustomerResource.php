<?php

namespace App\Filament\Resources\Customers;

use App\Filament\Resources\Customers\Pages\CreateCustomer;
use App\Filament\Resources\Customers\Pages\EditCustomer;
use App\Filament\Resources\Customers\Pages\ListCustomers;
use App\Filament\Resources\Customers\Pages\ViewCustomer;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Customer;
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
use Illuminate\Database\Eloquent\SoftDeletingScope;
use UnitEnum;

class CustomerResource extends Resource
{
    protected static ?string $model = Customer::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static ?string $navigationLabel = 'Pelanggan';

    protected static ?string $modelLabel = 'pelanggan';

    protected static ?string $pluralModelLabel = 'pelanggan';

    protected static string|UnitEnum|null $navigationGroup = 'Master Data';

    protected static ?int $navigationSort = 10;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Profil pelanggan')
                    ->schema([
                        Hidden::make('tenant_id')
                            ->default(fn (): ?string => TenantPanelAccess::tenantId()),
                        TextInput::make('name')
                            ->label('Nama')
                            ->required()
                            ->maxLength(150),
                        TextInput::make('phone_normalized')
                            ->label('Nomor WhatsApp')
                            ->required()
                            ->maxLength(20),
                        Textarea::make('notes')
                            ->label('Catatan')
                            ->rows(4)
                            ->columnSpanFull(),
                    ])
                    ->columns(2),
            ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Ringkasan pelanggan')
                    ->schema([
                        TextEntry::make('name')
                            ->label('Nama'),
                        TextEntry::make('phone_normalized')
                            ->label('Nomor WhatsApp'),
                        TextEntry::make('orders_count')
                            ->label('Total order'),
                        TextEntry::make('created_at')
                            ->label('Dibuat')
                            ->dateTime('d M Y H:i'),
                        TextEntry::make('updated_at')
                            ->label('Diperbarui')
                            ->dateTime('d M Y H:i'),
                        TextEntry::make('deleted_at')
                            ->label('Diarsipkan')
                            ->dateTime('d M Y H:i')
                            ->placeholder('-'),
                        TextEntry::make('notes')
                            ->label('Catatan')
                            ->placeholder('-')
                            ->columnSpanFull(),
                    ])
                    ->columns(2),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query): Builder => $query->withCount('orders'))
            ->columns([
                TextColumn::make('name')
                    ->label('Nama')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('phone_normalized')
                    ->label('Nomor WA')
                    ->searchable()
                    ->copyable(),
                TextColumn::make('orders_count')
                    ->label('Order')
                    ->badge()
                    ->sortable(),
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
            ->defaultSort('updated_at', 'desc');
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListCustomers::route('/'),
            'create' => CreateCustomer::route('/create'),
            'view' => ViewCustomer::route('/{record}'),
            'edit' => EditCustomer::route('/{record}/edit'),
        ];
    }

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
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
