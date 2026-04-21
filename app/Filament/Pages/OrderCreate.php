<?php

namespace App\Filament\Pages;

use App\Domain\Billing\QuotaService;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Customer;
use App\Models\OutletService;
use App\Models\Service;
use App\Models\User;
use BackedEnum;
use Filament\Pages\Page;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class OrderCreate extends Page
{
    protected static bool $shouldRegisterNavigation = false;

    protected static ?string $slug = 'orders/create';

    protected static ?string $navigationLabel = 'Order Baru';

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-plus';

    protected static string|UnitEnum|null $navigationGroup = 'Operasional';

    protected string $view = 'filament.pages.order-create';

    public array $outlets = [];

    public array $services = [];

    public array $outletServicePriceMap = [];

    public array $customerSeeds = [];

    public array $couriers = [];

    public array $quota = [];

    public static function canAccess(): bool
    {
        return filled(TenantPanelAccess::tenantId())
            && (TenantPanelAccess::user()?->hasAnyRole(['owner', 'admin']) ?? false);
    }

    public function mount(): void
    {
        $tenant = TenantPanelAccess::tenant();
        $user = TenantPanelAccess::user();

        abort_unless($tenant && $user, 403);

        $ownerMode = TenantPanelAccess::isOwner($user);
        $allowedOutletIds = TenantPanelAccess::allowedOutletIds($user);

        $outlets = TenantPanelAccess::visibleOutletsQuery($user)
            ->get(['id', 'name', 'code']);

        $services = Service::query()
            ->where('tenant_id', $tenant->id)
            ->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'unit_type', 'base_price_amount']);

        $outletIds = $outlets->pluck('id')->values()->all();
        $serviceIds = $services->pluck('id')->values()->all();

        $this->outletServicePriceMap = OutletService::query()
            ->whereIn('outlet_id', $outletIds)
            ->whereIn('service_id', $serviceIds)
            ->where('active', true)
            ->whereNotNull('price_override_amount')
            ->get(['outlet_id', 'service_id', 'price_override_amount'])
            ->groupBy('outlet_id')
            ->map(function ($rows): array {
                return collect($rows)->mapWithKeys(fn ($row): array => [
                    (string) $row->service_id => (int) $row->price_override_amount,
                ])->all();
            })
            ->all();

        $this->outlets = $outlets
            ->map(fn ($outlet): array => [
                'id' => (string) $outlet->id,
                'name' => (string) $outlet->name,
                'code' => (string) ($outlet->code ?? ''),
            ])
            ->all();

        $this->services = $services
            ->map(fn (Service $service): array => [
                'id' => (string) $service->id,
                'name' => (string) $service->name,
                'unit_type' => (string) $service->unit_type,
                'base_price_amount' => (int) $service->base_price_amount,
            ])
            ->all();

        $this->customerSeeds = Customer::query()
            ->where('tenant_id', $tenant->id)
            ->orderByDesc('updated_at')
            ->limit(200)
            ->get(['id', 'name', 'phone_normalized', 'notes'])
            ->map(fn (Customer $row): array => [
                'id' => (string) $row->id,
                'name' => (string) $row->name,
                'phone' => (string) $row->phone_normalized,
                'notes' => (string) ($row->notes ?? ''),
            ])
            ->all();

        $couriersQuery = User::query()
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->whereHas('roles', fn (Builder $query) => $query->where('key', 'courier'))
            ->orderBy('name');

        if (! $ownerMode) {
            $couriersQuery->whereHas('outlets', fn (Builder $query) => $query->whereIn('outlets.id', $allowedOutletIds));
        }

        $this->couriers = $couriersQuery
            ->get(['id', 'name'])
            ->map(fn (User $courier): array => [
                'id' => (int) $courier->id,
                'name' => (string) $courier->name,
            ])
            ->all();

        $this->quota = app(QuotaService::class)->snapshot($tenant->id);
    }
}
