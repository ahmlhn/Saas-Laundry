<?php

namespace App\Filament\Pages;

use App\Domain\Billing\PlanFeatureGateService;
use App\Domain\Messaging\WaTemplateResolver;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Outlet;
use App\Models\WaMessage;
use App\Models\WaProvider;
use App\Models\WaProviderConfig;
use BackedEnum;
use Filament\Pages\Page;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class WhatsApp extends Page
{
    protected static ?string $slug = 'whatsapp';

    protected static ?string $navigationLabel = 'WhatsApp';

    protected static string|UnitEnum|null $navigationGroup = 'Integrasi';

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-chat-bubble-left-right';

    protected static ?int $navigationSort = 10;

    protected string $view = 'filament.pages.whatsapp';

    public ?string $selectedOutletId = null;

    public array $outlets = [];

    public array $providerRows = [];

    public array $messages = [];

    public array $templateRows = [];

    public array $messageSummary = [];

    public array $providerSummary = [];

    public array $templateSummary = [];

    public static function canAccess(): bool
    {
        $tenant = TenantPanelAccess::tenant();
        $user = TenantPanelAccess::user();

        if (! $tenant || ! $user || ! $user->hasAnyRole(['owner', 'admin'])) {
            return false;
        }

        $tenant->loadMissing('currentPlan:id,key');

        return app(PlanFeatureGateService::class)->isWaEnabledForTenant($tenant);
    }

    public function mount(): void
    {
        $tenant = TenantPanelAccess::tenant();
        $user = TenantPanelAccess::user();

        abort_unless($tenant && $user, 403);
        abort_unless(static::canAccess(), 403);

        $ownerMode = TenantPanelAccess::isOwner($user);
        $allowedOutletIds = TenantPanelAccess::allowedOutletIds($user);

        $outlets = Outlet::query()
            ->where('tenant_id', $tenant->id)
            ->when(! $ownerMode, fn (Builder $query) => $query->whereIn('id', $allowedOutletIds))
            ->orderBy('name')
            ->get(['id', 'name', 'code']);

        $this->selectedOutletId = $this->sanitizeNullableString(request()->query('outlet_id'));
        if ($this->selectedOutletId && ! $outlets->pluck('id')->contains($this->selectedOutletId)) {
            $this->selectedOutletId = null;
        }

        $this->outlets = $outlets
            ->map(fn (Outlet $outlet): array => [
                'id' => (string) $outlet->id,
                'name' => (string) $outlet->name,
                'code' => (string) ($outlet->code ?? ''),
            ])
            ->all();

        $providers = WaProvider::query()
            ->where('active', true)
            ->orderBy('id')
            ->get();

        $configs = WaProviderConfig::query()
            ->with('provider:id,key,name')
            ->where('tenant_id', $tenant->id)
            ->get()
            ->keyBy('provider_id');

        $this->providerRows = $providers
            ->map(function (WaProvider $provider) use ($configs): array {
                $config = $configs->get($provider->id);

                return [
                    'provider_id' => (int) $provider->id,
                    'provider_key' => (string) $provider->key,
                    'provider_name' => (string) $provider->name,
                    'configured' => $config !== null,
                    'is_active' => (bool) ($config?->is_active ?? false),
                    'sender' => (string) ($config?->credentials_json['sender'] ?? $config?->credentials_json['device'] ?? '-'),
                    'updated_at' => $config?->updated_at?->format('d M Y H:i') ?? '-',
                ];
            })
            ->all();

        $messagesQuery = WaMessage::query()->where('tenant_id', $tenant->id);

        if ($this->selectedOutletId) {
            $messagesQuery->where('outlet_id', $this->selectedOutletId);
        } elseif (! $ownerMode) {
            $messagesQuery->whereIn('outlet_id', $allowedOutletIds);
        }

        $lastSentAt = (clone $messagesQuery)
            ->whereIn('status', ['sent', 'delivered'])
            ->max('updated_at');

        $total = (clone $messagesQuery)->count();
        $failed = (clone $messagesQuery)->where('status', 'failed')->count();

        $this->messageSummary = [
            'total' => $total,
            'queued' => (clone $messagesQuery)->where('status', 'queued')->count(),
            'sent' => (clone $messagesQuery)->whereIn('status', ['sent', 'delivered'])->count(),
            'failed' => $failed,
            'failure_rate' => $total > 0 ? (int) round(($failed / $total) * 100) : 0,
            'last_sent_at' => $lastSentAt?->format('d M Y H:i') ?? '-',
        ];

        $this->messages = (clone $messagesQuery)
            ->latest('created_at')
            ->limit(50)
            ->get(['template_id', 'to_phone', 'status', 'attempts', 'last_error_code', 'created_at'])
            ->map(fn (WaMessage $message): array => [
                'template_id' => (string) $message->template_id,
                'to_phone' => (string) $message->to_phone,
                'status' => (string) $message->status,
                'attempts' => (int) $message->attempts,
                'last_error_code' => (string) ($message->last_error_code ?? '-'),
                'created_at' => $message->created_at?->format('d M Y H:i') ?? '-',
            ])
            ->all();

        $this->templateRows = array_map(
            fn (array $row): array => [
                'template_id' => (string) ($row['template_id'] ?? '-'),
                'source' => (string) ($row['source'] ?? 'default'),
                'version' => (string) ($row['version'] ?? '-'),
            ],
            app(WaTemplateResolver::class)->listResolved(
                tenantId: $tenant->id,
                outletId: $this->selectedOutletId,
            ),
        );

        $this->providerSummary = [
            'configured_count' => collect($this->providerRows)->where('configured', true)->count(),
            'active_count' => collect($this->providerRows)->where('is_active', true)->count(),
            'active_provider_key' => (string) (collect($this->providerRows)->firstWhere('is_active', true)['provider_key'] ?? ''),
        ];

        $this->templateSummary = [
            'total' => count($this->templateRows),
            'default_count' => collect($this->templateRows)->where('source', 'default')->count(),
            'override_count' => collect($this->templateRows)->where('source', '!=', 'default')->count(),
        ];
    }

    private function sanitizeNullableString(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
