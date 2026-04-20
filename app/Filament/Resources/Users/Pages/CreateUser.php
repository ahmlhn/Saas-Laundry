<?php

namespace App\Filament\Resources\Users\Pages;

use App\Filament\Resources\Users\UserResource;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Role;
use Filament\Resources\Pages\CreateRecord;

class CreateUser extends CreateRecord
{
    protected static string $resource = UserResource::class;

    /**
     * @var array<int, string>
     */
    protected array $outletIds = [];

    protected ?string $roleKey = null;

    protected function mutateFormDataBeforeCreate(array $data): array
    {
        $this->roleKey = filled($data['role_key'] ?? null) ? (string) $data['role_key'] : null;
        $this->outletIds = collect($data['outlet_ids'] ?? [])
            ->filter(fn ($id): bool => is_string($id) && $id !== '')
            ->values()
            ->all();

        unset($data['role_key'], $data['outlet_ids']);

        $data['tenant_id'] = TenantPanelAccess::tenantId();

        return $data;
    }

    protected function afterCreate(): void
    {
        $roleId = Role::query()
            ->where('key', $this->roleKey)
            ->value('id');

        if ($roleId) {
            $this->record->roles()->sync([$roleId]);
        }

        $this->record->outlets()->sync($this->outletIds);
    }
}
