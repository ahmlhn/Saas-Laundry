<?php

namespace App\Domain\Billing;

use App\Models\QuotaUsageCycle;
use App\Models\QuotaUsage;
use App\Models\SubscriptionCycle;
use App\Models\Tenant;
use Illuminate\Support\Facades\DB;

class QuotaService
{
    public function consumeOrderSlot(string $tenantId, ?string $period = null): QuotaUsage
    {
        $period = $period ?: now()->format('Y-m');

        return DB::transaction(function () use ($tenantId, $period): QuotaUsage {
            /** @var Tenant $tenant */
            $tenant = Tenant::query()
                ->with([
                    'currentPlan:id,key,orders_limit',
                    'currentSubscriptionCycle:id,tenant_id,plan_id,orders_limit_snapshot,status,cycle_start_at,cycle_end_at',
                    'currentSubscriptionCycle.plan:id,key,orders_limit',
                ])
                ->findOrFail($tenantId);

            $this->ensureWriteAccess($tenant);
            $planKey = $tenant->currentPlan?->key;

            $activeCycle = $this->resolveActiveCycle($tenant);

            if ($activeCycle) {
                /** @var QuotaUsageCycle $cycleUsage */
                $cycleUsage = QuotaUsageCycle::query()->firstOrCreate(
                    [
                        'tenant_id' => $tenantId,
                        'cycle_id' => $activeCycle->id,
                    ],
                    [
                        'orders_limit_snapshot' => $activeCycle->orders_limit_snapshot,
                        'orders_used' => 0,
                    ]
                );

                $cycleUsage = QuotaUsageCycle::query()
                    ->whereKey($cycleUsage->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $limit = $activeCycle->orders_limit_snapshot;
                if (is_null($limit)) {
                    $limit = $activeCycle->plan?->orders_limit ?? $tenant->currentPlan?->orders_limit;
                }

                $planKey = $activeCycle->plan?->key ?? $planKey;

                if (! is_null($limit) && $cycleUsage->orders_used >= $limit) {
                    throw new QuotaExceededException(
                        planKey: $planKey,
                        period: $period,
                        ordersLimit: (int) $limit,
                        ordersUsed: (int) $cycleUsage->orders_used,
                    );
                }

                $cycleUsage->forceFill([
                    'orders_limit_snapshot' => $limit,
                    'orders_used' => (int) $cycleUsage->orders_used + 1,
                ])->save();
            }

            /** @var QuotaUsage $usage */
            $usage = QuotaUsage::query()->firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'period' => $period,
                ],
                [
                    'orders_used' => 0,
                ]
            );

            $usage = QuotaUsage::query()
                ->whereKey($usage->id)
                ->lockForUpdate()
                ->firstOrFail();

            if (! $activeCycle) {
                $limit = $tenant->currentPlan?->orders_limit;

                if (! is_null($limit) && $usage->orders_used >= $limit) {
                    throw new QuotaExceededException(
                        planKey: $planKey,
                        period: $period,
                        ordersLimit: (int) $limit,
                        ordersUsed: (int) $usage->orders_used,
                    );
                }
            }

            $usage->forceFill([
                'orders_used' => (int) $usage->orders_used + 1,
            ])->save();

            return $usage;
        });
    }

    /**
     * @return array{
     *     plan: string|null,
     *     period: string,
     *     orders_limit: int|null,
     *     orders_used: int,
     *     orders_remaining: int|null,
     *     can_create_order: bool,
     *     subscription_state: string,
     *     write_access_mode: string,
     *     cycle_start_at: string|null,
     *     cycle_end_at: string|null
     * }
     */
    public function snapshot(string $tenantId, ?string $period = null): array
    {
        $period = $period ?: now()->format('Y-m');

        /** @var Tenant $tenant */
        $tenant = Tenant::query()
            ->with([
                'currentPlan:id,key,orders_limit',
                'currentSubscriptionCycle:id,tenant_id,plan_id,orders_limit_snapshot,status,cycle_start_at,cycle_end_at',
                'currentSubscriptionCycle.plan:id,key,orders_limit',
            ])
            ->findOrFail($tenantId);

        $state = (string) ($tenant->subscription_state ?: 'active');
        $writeAccessMode = (string) ($tenant->write_access_mode ?: 'full');
        $writeAllowed = $state === 'active' && $writeAccessMode === 'full';
        $activeCycle = $this->resolveActiveCycle($tenant);

        if ($activeCycle) {
            $usage = QuotaUsageCycle::query()
                ->where('tenant_id', $tenantId)
                ->where('cycle_id', $activeCycle->id)
                ->first();

            $ordersLimit = $activeCycle->orders_limit_snapshot;
            if (is_null($ordersLimit)) {
                $ordersLimit = $activeCycle->plan?->orders_limit ?? $tenant->currentPlan?->orders_limit;
            }

            $ordersUsed = (int) ($usage?->orders_used ?? 0);
            $remaining = is_null($ordersLimit) ? null : max((int) $ordersLimit - $ordersUsed, 0);

            return [
                'plan' => $activeCycle->plan?->key ?? $tenant->currentPlan?->key,
                'period' => $period,
                'orders_limit' => $ordersLimit,
                'orders_used' => $ordersUsed,
                'orders_remaining' => $remaining,
                'can_create_order' => $writeAllowed && (is_null($ordersLimit) || $remaining > 0),
                'subscription_state' => $state,
                'write_access_mode' => $writeAccessMode,
                'cycle_start_at' => $activeCycle->cycle_start_at?->toIso8601String(),
                'cycle_end_at' => $activeCycle->cycle_end_at?->toIso8601String(),
            ];
        }

        $legacyUsage = QuotaUsage::query()
            ->where('tenant_id', $tenantId)
            ->where('period', $period)
            ->first();

        $ordersLimit = $tenant->currentPlan?->orders_limit;
        $ordersUsed = (int) ($legacyUsage?->orders_used ?? 0);
        $remaining = is_null($ordersLimit) ? null : max((int) $ordersLimit - $ordersUsed, 0);

        return [
            'plan' => $tenant->currentPlan?->key,
            'period' => $period,
            'orders_limit' => $ordersLimit,
            'orders_used' => $ordersUsed,
            'orders_remaining' => $remaining,
            'can_create_order' => $writeAllowed && (is_null($ordersLimit) || $remaining > 0),
            'subscription_state' => $state,
            'write_access_mode' => $writeAccessMode,
            'cycle_start_at' => null,
            'cycle_end_at' => null,
        ];
    }

    public function ensureTenantWriteAccess(string $tenantId): void
    {
        /** @var Tenant $tenant */
        $tenant = Tenant::query()->findOrFail($tenantId);
        $this->ensureWriteAccess($tenant);
    }

    private function ensureWriteAccess(Tenant $tenant): void
    {
        $state = (string) ($tenant->subscription_state ?: 'active');
        $writeAccessMode = (string) ($tenant->write_access_mode ?: 'full');

        if ($state === 'active' && $writeAccessMode === 'full') {
            return;
        }

        throw new TenantWriteAccessException(
            subscriptionState: $state,
            writeAccessMode: $writeAccessMode,
        );
    }

    private function resolveActiveCycle(Tenant $tenant): ?SubscriptionCycle
    {
        $now = now();

        if ($tenant->relationLoaded('currentSubscriptionCycle')) {
            $current = $tenant->currentSubscriptionCycle;

            if ($current
                && $current->status === 'active'
                && $current->cycle_start_at
                && $current->cycle_end_at
                && $current->cycle_start_at->lte($now)
                && $current->cycle_end_at->gte($now)) {
                return $current;
            }
        }

        return SubscriptionCycle::query()
            ->with('plan:id,key,orders_limit')
            ->where('tenant_id', $tenant->id)
            ->where('status', 'active')
            ->where('cycle_start_at', '<=', $now)
            ->where('cycle_end_at', '>=', $now)
            ->orderByDesc('cycle_start_at')
            ->first();
    }
}
