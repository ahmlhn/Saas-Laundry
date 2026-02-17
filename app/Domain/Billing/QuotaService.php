<?php

namespace App\Domain\Billing;

use App\Models\QuotaUsage;
use App\Models\Tenant;
use Illuminate\Support\Facades\DB;

class QuotaService
{
    public function consumeOrderSlot(string $tenantId, ?string $period = null): QuotaUsage
    {
        $period = $period ?: now()->format('Y-m');

        return DB::transaction(function () use ($tenantId, $period): QuotaUsage {
            /** @var Tenant $tenant */
            $tenant = Tenant::query()->with('currentPlan:id,key,orders_limit')->findOrFail($tenantId);
            $limit = $tenant->currentPlan?->orders_limit;
            $planKey = $tenant->currentPlan?->key;

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

            if (! is_null($limit) && $usage->orders_used >= $limit) {
                throw new QuotaExceededException(
                    planKey: $planKey,
                    period: $period,
                    ordersLimit: (int) $limit,
                    ordersUsed: (int) $usage->orders_used,
                );
            }

            $usage->forceFill([
                'orders_used' => (int) $usage->orders_used + 1,
            ])->save();

            return $usage;
        });
    }

    /**
     * @return array{plan: string|null, period: string, orders_limit: int|null, orders_used: int, orders_remaining: int|null, can_create_order: bool}
     */
    public function snapshot(string $tenantId, ?string $period = null): array
    {
        $period = $period ?: now()->format('Y-m');

        /** @var Tenant $tenant */
        $tenant = Tenant::query()->with('currentPlan:id,key,orders_limit')->findOrFail($tenantId);

        $usage = QuotaUsage::query()
            ->where('tenant_id', $tenantId)
            ->where('period', $period)
            ->first();

        $ordersLimit = $tenant->currentPlan?->orders_limit;
        $ordersUsed = (int) ($usage?->orders_used ?? 0);
        $remaining = is_null($ordersLimit) ? null : max((int) $ordersLimit - $ordersUsed, 0);

        return [
            'plan' => $tenant->currentPlan?->key,
            'period' => $period,
            'orders_limit' => $ordersLimit,
            'orders_used' => $ordersUsed,
            'orders_remaining' => $remaining,
            'can_create_order' => is_null($ordersLimit) || $remaining > 0,
        ];
    }
}
