<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Models\Role;
use App\Models\User;
use Filament\Actions\DeleteAction;
use Filament\Actions\ForceDeleteAction;
use Filament\Actions\RestoreAction;
use Filament\Actions\ViewAction;
use Filament\Resources\Pages\EditRecord;

class EditUser extends EditRecord
{
    protected static string $resource = UserResource::class;

    /**
     * @var array<int, string>
     */
    protected array $outletIds = [];

    protected ?string $roleKey = null;

    protected function mutateFormDataBeforeFill(array $data): array
    {
        /** @var User $record */
        $record = $this->record;

        $data['role_key'] = $record->roles->pluck('key')->first();
        $data['outlet_ids'] = $record->outlets
            ->pluck('id')
            ->map(fn ($id): string => (string) $id)
            ->all();

        return $data;
    }

    protected function mutateFormDataBeforeSave(array $data): array
    {
        $this->roleKey = filled($data['role_key'] ?? null) ? (string) $data['role_key'] : null;
        $this->outletIds = collect($data['outlet_ids'] ?? [])
            ->filter(fn ($id): bool => is_string($id) && $id !== '')
            ->values()
            ->all();

        unset($data['role_key'], $data['outlet_ids']);

        if (! filled($data['password'] ?? null)) {
            unset($data['password']);
        }

        return $data;
    }

    protected function afterSave(): void
    {
        $roleId = Role::query()
            ->where('key', $this->roleKey)
            ->value('id');

        if ($roleId) {
            $this->record->roles()->sync([$roleId]);
        }

        $this->record->outlets()->sync($this->outletIds);
        $this->record->load(['roles:id,key,name', 'outlets:id,name,code']);
    }

    protected function getHeaderActions(): array
    {
        return [
            ViewAction::make(),
            DeleteAction::make()
                ->visible(fn (User $record): bool => UserResource::canDelete($record)),
            ForceDeleteAction::make()
                ->visible(fn (User $record): bool => UserResource::canForceDelete($record)),
            RestoreAction::make()
                ->visible(fn (User $record): bool => UserResource::canRestore($record)),
        ];
    }
}
