<?php

namespace App\Filament\Resources\Users;

use App\Filament\Resources\Users\Pages\CreateUser;
use App\Filament\Resources\Users\Pages\EditUser;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\Pages\ViewUser;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Role;
use App\Models\User;
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
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TrashedFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletingScope;
use UnitEnum;

class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUserGroup;

    protected static ?string $navigationLabel = 'Tim';

    protected static ?string $modelLabel = 'user';

    protected static ?string $pluralModelLabel = 'user';

    protected static string|UnitEnum|null $navigationGroup = 'Akses';

    protected static ?int $navigationSort = 10;

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Profil user')
                    ->schema([
                        Hidden::make('tenant_id')
                            ->default(fn (): ?string => TenantPanelAccess::tenantId()),
                        TextInput::make('name')
                            ->label('Nama')
                            ->required()
                            ->maxLength(120),
                        TextInput::make('email')
                            ->label('Email')
                            ->email()
                            ->required()
                            ->maxLength(255),
                        TextInput::make('phone')
                            ->label('Telepon')
                            ->tel()
                            ->maxLength(40),
                        TextInput::make('password')
                            ->label('Password')
                            ->password()
                            ->required(fn (string $operation): bool => $operation === 'create')
                            ->dehydrated(fn (?string $state): bool => filled($state))
                            ->minLength(8),
                        Select::make('status')
                            ->label('Status')
                            ->options([
                                'active' => 'Active',
                                'inactive' => 'Inactive',
                            ])
                            ->default('active')
                            ->required(),
                        Select::make('role_key')
                            ->label('Role')
                            ->options(fn (): array => Role::query()
                                ->whereIn('key', TenantPanelAccess::assignableRoleKeys())
                                ->orderBy('name')
                                ->pluck('name', 'key')
                                ->all())
                            ->required(),
                        Select::make('outlet_ids')
                            ->label('Akses outlet')
                            ->multiple()
                            ->options(fn (): array => TenantPanelAccess::assignableOutletOptions())
                            ->required()
                            ->searchable()
                            ->preload(),
                    ])
                    ->columns(2),
            ]);
    }

    public static function infolist(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Ringkasan user')
                    ->schema([
                        TextEntry::make('name')
                            ->label('Nama'),
                        TextEntry::make('email')
                            ->label('Email'),
                        TextEntry::make('phone')
                            ->label('Telepon')
                            ->placeholder('-'),
                        TextEntry::make('status')
                            ->label('Status')
                            ->badge(),
                        TextEntry::make('role_names')
                            ->label('Role')
                            ->state(fn (User $record): string => $record->roles->pluck('name')->join(', ')),
                        TextEntry::make('outlet_names')
                            ->label('Outlet')
                            ->state(fn (User $record): string => $record->outlets->pluck('name')->join(', '))
                            ->placeholder('-')
                            ->columnSpanFull(),
                        TextEntry::make('deleted_at')
                            ->label('Diarsipkan')
                            ->dateTime('d M Y H:i')
                            ->placeholder('-'),
                    ])
                    ->columns(2),
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
                TextColumn::make('email')
                    ->label('Email')
                    ->searchable()
                    ->copyable(),
                TextColumn::make('phone')
                    ->label('Telepon')
                    ->placeholder('-')
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('role_label')
                    ->label('Role')
                    ->state(fn (User $record): string => $record->roles->pluck('name')->join(', '))
                    ->badge(),
                TextColumn::make('outlet_summary')
                    ->label('Outlet')
                    ->state(fn (User $record): string => $record->outlets->pluck('code')->join(', '))
                    ->placeholder('-')
                    ->toggleable(),
                TextColumn::make('status')
                    ->label('Status')
                    ->badge(),
                TextColumn::make('deleted_at')
                    ->label('Arsip')
                    ->dateTime('d M Y H:i')
                    ->placeholder('-')
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->options([
                        'active' => 'Active',
                        'inactive' => 'Inactive',
                    ]),
                TrashedFilter::make(),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make()
                    ->visible(fn (User $record): bool => static::canEdit($record)),
                DeleteAction::make()
                    ->visible(fn (User $record): bool => static::canDelete($record)),
                RestoreAction::make()
                    ->visible(fn (User $record): bool => static::canRestore($record)),
                ForceDeleteAction::make()
                    ->visible(fn (User $record): bool => static::canForceDelete($record)),
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
            'index' => ListUsers::route('/'),
            'create' => CreateUser::route('/create'),
            'view' => ViewUser::route('/{record}'),
            'edit' => EditUser::route('/{record}/edit'),
        ];
    }

    public static function canCreate(): bool
    {
        return TenantPanelAccess::assignableRoleKeys() !== [];
    }

    public static function canEdit(Model $record): bool
    {
        return $record instanceof User && TenantPanelAccess::canManageUser($record);
    }

    public static function canDelete(Model $record): bool
    {
        return $record instanceof User
            && TenantPanelAccess::isOwner()
            && TenantPanelAccess::canManageUser($record);
    }

    public static function canRestore(Model $record): bool
    {
        return static::canDelete($record);
    }

    public static function canForceDelete(Model $record): bool
    {
        return static::canDelete($record);
    }

    public static function getEloquentQuery(): Builder
    {
        $query = parent::getEloquentQuery()
            ->with([
                'roles:id,key,name',
                'outlets:id,name,code,tenant_id',
            ])
            ->where('tenant_id', TenantPanelAccess::tenantId());

        if (! TenantPanelAccess::isOwner()) {
            $query->whereHas('outlets', fn (Builder $builder) => $builder->whereIn('outlets.id', TenantPanelAccess::allowedOutletIds()));
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
