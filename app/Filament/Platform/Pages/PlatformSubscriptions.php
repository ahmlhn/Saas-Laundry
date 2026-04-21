<?php

namespace App\Filament\Platform\Pages;

use App\Filament\Platform\Support\PlatformPanelAccess;
use App\Models\Tenant;
use BackedEnum;
use Filament\Pages\Page;
use Filament\Support\Icons\Heroicon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use UnitEnum;

class PlatformSubscriptions extends Page
{
    protected static ?string $slug = 'subscriptions';

    protected static ?string $navigationLabel = 'Subscriptions';

    protected static string|UnitEnum|null $navigationGroup = 'Platform';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static ?int $navigationSort = 10;

    protected string $view = 'filament.platform.pages.subscriptions';

    public string $queryText = '';

    public ?string $state = null;

    public static function canAccess(): bool
    {
        return PlatformPanelAccess::isPlatformUser();
    }

    public function mount(): void
    {
        abort_unless(static::canAccess(), 403);

        $this->queryText = $this->sanitizeString(request()->query('q'));
        $this->state = $this->sanitizeEnum(request()->query('state'), ['active', 'past_due', 'suspended']);
    }

    public function getTitle(): string
    {
        return 'Tenant Subscriptions';
    }

    protected function getViewData(): array
    {
        return [
            'filters' => [
                'q' => $this->queryText,
                'state' => $this->state,
            ],
            'tenants' => $this->tenants(),
        ];
    }

    protected function tenants(): LengthAwarePaginator
    {
        $query = Tenant::query()
            ->with([
                'currentPlan:id,key,name,monthly_price_amount,currency',
                'currentSubscriptionCycle:id,tenant_id,status,cycle_start_at,cycle_end_at,auto_renew',
            ])
            ->orderBy('name');

        if ($this->state) {
            $query->where('subscription_state', $this->state);
        }

        if ($this->queryText !== '') {
            $keyword = $this->queryText;

            $query->where(function ($builder) use ($keyword): void {
                $builder->where('name', 'like', '%'.$keyword.'%')
                    ->orWhere('id', 'like', '%'.$keyword.'%')
                    ->orWhere('slug', 'like', '%'.$keyword.'%');
            });
        }

        return $query->paginate(30)->withQueryString();
    }

    private function sanitizeString(mixed $value): string
    {
        return is_string($value) ? trim($value) : '';
    }

    /**
     * @param  array<int, string>  $allowed
     */
    private function sanitizeEnum(mixed $value, array $allowed): ?string
    {
        return is_string($value) && in_array($value, $allowed, true) ? $value : null;
    }
}
