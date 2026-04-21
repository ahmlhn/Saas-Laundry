<?php

namespace App\Filament\Platform\Pages;

use App\Domain\Platform\PlatformSubscriptionOpsService;
use App\Filament\Platform\Support\PlatformPanelAccess;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentEvent;
use App\Models\Tenant;
use App\Models\User;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Validator;
use UnitEnum;

class PlatformTenantSubscription extends Page
{
    protected static ?string $slug = 'subscriptions/tenants/{tenant}';

    protected static bool $shouldRegisterNavigation = false;

    protected string $view = 'filament.platform.pages.tenant-subscription';

    public string $tenantId = '';

    public array $tenantSummary = [];

    public array $invoices = [];

    public array $paymentEvents = [];

    public array $invoiceDecision = [];

    public array $invoiceNote = [];

    public static function canAccess(): bool
    {
        return PlatformPanelAccess::isPlatformUser();
    }

    public function mount(string $tenant): void
    {
        abort_unless(static::canAccess(), 403);

        $this->loadTenantData($this->resolveTenant($tenant));
    }

    public function verifyInvoice(string $invoiceId): void
    {
        abort_unless(static::canAccess(), 403);

        $user = PlatformPanelAccess::user();
        abort_unless($user instanceof User, 403);

        Validator::make(
            [
                'invoiceDecision' => [$invoiceId => $this->invoiceDecision[$invoiceId] ?? null],
                'invoiceNote' => [$invoiceId => $this->invoiceNote[$invoiceId] ?? null],
            ],
            [
                "invoiceDecision.$invoiceId" => ['required', 'string', 'in:approve,reject'],
                "invoiceNote.$invoiceId" => ['nullable', 'string', 'max:500'],
            ]
        )->validate();

        app(PlatformSubscriptionOpsService::class)->verifyInvoice(
            user: $user,
            invoiceId: $invoiceId,
            decision: (string) ($this->invoiceDecision[$invoiceId] ?? 'approve'),
            note: $this->invoiceNote[$invoiceId] ?? null,
            request: request(),
        );

        $this->invoiceDecision[$invoiceId] = 'approve';
        $this->invoiceNote[$invoiceId] = '';
        $this->loadTenantData($this->currentTenant());

        Notification::make()
            ->title('Verifikasi invoice berhasil diproses.')
            ->success()
            ->send();
    }

    public function suspendTenant(): void
    {
        abort_unless(PlatformPanelAccess::isPlatformOwner(), 403);

        $user = PlatformPanelAccess::user();
        abort_unless($user instanceof User, 403);

        app(PlatformSubscriptionOpsService::class)->suspendTenant($user, $this->currentTenant(), request());
        $this->loadTenantData($this->currentTenant());

        Notification::make()
            ->title('Tenant berhasil disuspend (read-only).')
            ->success()
            ->send();
    }

    public function activateTenant(): void
    {
        abort_unless(PlatformPanelAccess::isPlatformOwner(), 403);

        $user = PlatformPanelAccess::user();
        abort_unless($user instanceof User, 403);

        app(PlatformSubscriptionOpsService::class)->activateTenant($user, $this->currentTenant(), request());
        $this->loadTenantData($this->currentTenant());

        Notification::make()
            ->title('Tenant berhasil diaktifkan kembali.')
            ->success()
            ->send();
    }

    public function getTitle(): string
    {
        return 'Tenant Subscription';
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('back')
                ->label('Kembali ke daftar')
                ->url(PlatformSubscriptions::getUrl(panel: 'platform')),
            Action::make('suspendTenant')
                ->label('Suspend Tenant')
                ->color('danger')
                ->requiresConfirmation()
                ->visible(fn (): bool => PlatformPanelAccess::isPlatformOwner() && (($this->tenantSummary['subscription_state'] ?? null) !== 'suspended' || ($this->tenantSummary['write_access_mode'] ?? null) !== 'read_only'))
                ->action(fn () => $this->suspendTenant()),
            Action::make('activateTenant')
                ->label('Activate Tenant')
                ->color('success')
                ->requiresConfirmation()
                ->visible(fn (): bool => PlatformPanelAccess::isPlatformOwner() && (($this->tenantSummary['subscription_state'] ?? null) !== 'active' || ($this->tenantSummary['write_access_mode'] ?? null) !== 'full'))
                ->action(fn () => $this->activateTenant()),
        ];
    }

    /**
     * @return array<string>
     */
    public function getBreadcrumbs(): array
    {
        return [
            PlatformSubscriptions::getUrl(panel: 'platform') => 'Subscriptions',
            '#' => (string) ($this->tenantSummary['name'] ?? 'Tenant'),
        ];
    }

    private function resolveTenant(string $tenant): Tenant
    {
        return Tenant::query()
            ->with([
                'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
                'currentSubscriptionCycle:id,tenant_id,plan_id,status,orders_limit_snapshot,cycle_start_at,cycle_end_at,auto_renew,activated_at',
                'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
            ])
            ->whereKey($tenant)
            ->orWhere('slug', $tenant)
            ->firstOrFail();
    }

    private function currentTenant(): Tenant
    {
        return $this->resolveTenant($this->tenantId);
    }

    private function loadTenantData(Tenant $tenantRow): void
    {
        $this->tenantId = (string) $tenantRow->id;
        $this->tenantSummary = [
            'id' => (string) $tenantRow->id,
            'slug' => (string) $tenantRow->slug,
            'name' => (string) $tenantRow->name,
            'subscription_state' => (string) ($tenantRow->subscription_state ?? 'active'),
            'write_access_mode' => (string) ($tenantRow->write_access_mode ?? 'full'),
            'plan_name' => (string) ($tenantRow->currentPlan?->name ?? '-'),
            'plan_key' => (string) ($tenantRow->currentPlan?->key ?? '-'),
            'orders_limit' => $tenantRow->currentPlan?->orders_limit,
            'cycle_start_at' => $tenantRow->currentSubscriptionCycle?->cycle_start_at?->format('d M Y H:i') ?? '-',
            'cycle_end_at' => $tenantRow->currentSubscriptionCycle?->cycle_end_at?->format('d M Y H:i') ?? '-',
            'cycle_status' => (string) ($tenantRow->currentSubscriptionCycle?->status ?? '-'),
        ];

        $this->invoices = SubscriptionInvoice::query()
            ->with([
                'proofs' => fn ($query) => $query->latest('created_at'),
                'paymentEvents' => fn ($query) => $query->latest('received_at'),
            ])
            ->where('tenant_id', $tenantRow->id)
            ->latest('issued_at')
            ->limit(30)
            ->get()
            ->map(function (SubscriptionInvoice $invoice): array {
                $latestEvent = $invoice->paymentEvents->first();

                return [
                    'id' => (string) $invoice->id,
                    'invoice_no' => (string) $invoice->invoice_no,
                    'status' => (string) $invoice->status,
                    'payment_method' => (string) $invoice->payment_method,
                    'amount_total' => (int) $invoice->amount_total,
                    'due_at' => $invoice->due_at?->format('d M Y H:i') ?? '-',
                    'issued_at' => $invoice->issued_at?->format('d M Y H:i') ?? '-',
                    'gateway_status' => (string) ($invoice->gateway_status ?? '-'),
                    'gateway_reference' => (string) ($invoice->gateway_reference ?? '-'),
                    'latest_event_status' => (string) ($latestEvent?->process_status ?? '-'),
                    'latest_event_at' => $latestEvent?->received_at?->format('d M Y H:i') ?? '-',
                    'proofs' => $invoice->proofs
                        ->map(fn ($proof): array => [
                            'file_name' => (string) $proof->file_name,
                            'status' => (string) $proof->status,
                            'created_at' => $proof->created_at?->format('d M Y H:i') ?? '-',
                        ])
                        ->all(),
                ];
            })
            ->all();

        foreach ($this->invoices as $invoice) {
            $invoiceId = (string) $invoice['id'];
            $this->invoiceDecision[$invoiceId] ??= 'approve';
            $this->invoiceNote[$invoiceId] ??= '';
        }

        $knownInvoiceIds = collect($this->invoices)
            ->map(fn (array $invoice): string => (string) $invoice['id'])
            ->all();

        $this->invoiceDecision = array_intersect_key($this->invoiceDecision, array_flip($knownInvoiceIds));
        $this->invoiceNote = array_intersect_key($this->invoiceNote, array_flip($knownInvoiceIds));

        $this->paymentEvents = SubscriptionPaymentEvent::query()
            ->with('invoice:id,invoice_no')
            ->where('tenant_id', $tenantRow->id)
            ->latest('received_at')
            ->limit(30)
            ->get()
            ->map(fn (SubscriptionPaymentEvent $event): array => [
                'received_at' => $event->received_at?->format('d M Y H:i') ?? '-',
                'gateway_event_id' => (string) $event->gateway_event_id,
                'event_type' => (string) $event->event_type,
                'process_status' => (string) $event->process_status,
                'invoice_no' => (string) ($event->invoice?->invoice_no ?? $event->invoice_id ?? '-'),
                'amount_total' => $event->amount_total !== null ? (int) $event->amount_total : null,
                'rejection_reason' => (string) ($event->rejection_reason ?? '-'),
            ])
            ->all();
    }
}
