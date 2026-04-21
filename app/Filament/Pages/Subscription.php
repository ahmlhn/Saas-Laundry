<?php

namespace App\Filament\Pages;

use App\Domain\Billing\QuotaService;
use App\Filament\Support\TenantPanelAccess;
use App\Models\Plan;
use App\Models\SubscriptionChangeRequest;
use App\Models\SubscriptionInvoice;
use BackedEnum;
use Filament\Pages\Page;
use UnitEnum;

class Subscription extends Page
{
    protected static ?string $slug = 'subscription';

    protected static ?string $navigationLabel = 'Subscription';

    protected static string|UnitEnum|null $navigationGroup = 'Keuangan';

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-credit-card';

    protected static ?int $navigationSort = 20;

    protected string $view = 'filament.pages.subscription';

    public array $quota = [];

    public array $activeCycle = [];

    public array $plans = [];

    public array $pendingChange = [];

    public array $invoices = [];

    public array $currentPlan = [];

    public string $subscriptionState = 'active';

    public string $writeAccessMode = 'full';

    public static function canAccess(): bool
    {
        return filled(TenantPanelAccess::tenantId()) && TenantPanelAccess::isOwner();
    }

    public function mount(): void
    {
        $tenant = TenantPanelAccess::tenant();

        abort_unless($tenant && TenantPanelAccess::isOwner(), 403);

        $tenant->load([
            'currentPlan:id,key,name,orders_limit,monthly_price_amount,currency',
            'currentSubscriptionCycle:id,tenant_id,plan_id,status,orders_limit_snapshot,cycle_start_at,cycle_end_at,auto_renew,activated_at',
            'currentSubscriptionCycle.plan:id,key,name,orders_limit,monthly_price_amount,currency',
        ]);

        $this->quota = app(QuotaService::class)->snapshot($tenant->id);
        $this->subscriptionState = (string) ($tenant->subscription_state ?? 'active');
        $this->writeAccessMode = (string) ($tenant->write_access_mode ?? 'full');
        $this->currentPlan = [
            'id' => (int) ($tenant->currentPlan?->id ?? 0),
            'key' => (string) ($tenant->currentPlan?->key ?? '-'),
            'name' => (string) ($tenant->currentPlan?->name ?? '-'),
            'orders_limit' => $tenant->currentPlan?->orders_limit,
            'monthly_price_amount' => (int) ($tenant->currentPlan?->monthly_price_amount ?? 0),
            'currency' => (string) ($tenant->currentPlan?->currency ?? 'IDR'),
        ];

        $activeCycle = $tenant->currentSubscriptionCycle;
        $this->activeCycle = $activeCycle ? [
            'plan_name' => (string) ($activeCycle->plan?->name ?? '-'),
            'plan_key' => (string) ($activeCycle->plan?->key ?? '-'),
            'status' => (string) ($activeCycle->status ?? '-'),
            'cycle_start_at' => $activeCycle->cycle_start_at?->format('d M Y H:i') ?? '-',
            'cycle_end_at' => $activeCycle->cycle_end_at?->format('d M Y H:i') ?? '-',
            'auto_renew' => (bool) $activeCycle->auto_renew,
            'orders_limit_snapshot' => $activeCycle->orders_limit_snapshot,
            'activated_at' => $activeCycle->activated_at?->format('d M Y H:i') ?? '-',
        ] : [];

        $this->plans = Plan::query()
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('id')
            ->get(['id', 'key', 'name', 'orders_limit', 'monthly_price_amount', 'currency'])
            ->map(fn (Plan $plan): array => [
                'id' => (int) $plan->id,
                'key' => (string) $plan->key,
                'name' => (string) $plan->name,
                'orders_limit' => $plan->orders_limit,
                'monthly_price_amount' => (int) ($plan->monthly_price_amount ?? 0),
                'currency' => (string) ($plan->currency ?? 'IDR'),
            ])
            ->all();

        $pendingChange = SubscriptionChangeRequest::query()
            ->with('targetPlan:id,key,name,orders_limit,monthly_price_amount,currency')
            ->where('tenant_id', $tenant->id)
            ->where('status', 'pending')
            ->latest('created_at')
            ->first();

        $this->pendingChange = $pendingChange ? [
            'id' => (string) $pendingChange->id,
            'effective_at' => $pendingChange->effective_at?->format('d M Y H:i') ?? '-',
            'requested_at' => $pendingChange->created_at?->format('d M Y H:i') ?? '-',
            'decision_note' => (string) ($pendingChange->decision_note ?? ''),
            'target_plan_name' => (string) ($pendingChange->targetPlan?->name ?? '-'),
            'target_plan_key' => (string) ($pendingChange->targetPlan?->key ?? '-'),
            'target_plan_price' => (int) ($pendingChange->targetPlan?->monthly_price_amount ?? 0),
        ] : [];

        $this->invoices = SubscriptionInvoice::query()
            ->with([
                'paymentIntents' => fn ($query) => $query->latest('created_at'),
                'paymentEvents' => fn ($query) => $query->latest('received_at'),
            ])
            ->withCount('proofs')
            ->where('tenant_id', $tenant->id)
            ->latest('issued_at')
            ->limit(20)
            ->get()
            ->map(function (SubscriptionInvoice $invoice): array {
                $latestIntent = $invoice->paymentIntents->first();
                $latestEvent = $invoice->paymentEvents->first();

                return [
                    'id' => (string) $invoice->id,
                    'invoice_no' => (string) $invoice->invoice_no,
                    'status' => (string) $invoice->status,
                    'payment_method' => (string) $invoice->payment_method,
                    'amount_total' => (int) $invoice->amount_total,
                    'issued_at' => $invoice->issued_at?->format('d M Y H:i') ?? '-',
                    'due_at' => $invoice->due_at?->format('d M Y H:i') ?? '-',
                    'gateway_status' => (string) ($invoice->gateway_status ?? 'waiting'),
                    'gateway_reference' => (string) ($invoice->gateway_reference ?? '-'),
                    'qris_payload' => (string) ($invoice->qris_payload ?? ''),
                    'qris_expires_at' => $latestIntent?->expires_at?->format('d M Y H:i') ?? '-',
                    'latest_event_status' => (string) ($latestEvent?->process_status ?? ''),
                    'latest_event_at' => $latestEvent?->received_at?->format('d M Y H:i') ?? '-',
                    'proofs_count' => (int) $invoice->proofs_count,
                ];
            })
            ->all();
    }
}
