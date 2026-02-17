<?php

namespace App\Domain\Billing;

use App\Models\Tenant;

class PlanFeatureGateService
{
    /**
     * @var array<int, string>
     */
    private const WA_ELIGIBLE_PLANS = ['premium', 'pro'];

    public function isWaEnabledForTenant(Tenant $tenant): bool
    {
        $planKey = strtolower((string) ($tenant->currentPlan?->key ?? ''));

        return in_array($planKey, self::WA_ELIGIBLE_PLANS, true);
    }

    public function ensureWaEnabledForTenant(Tenant $tenant): void
    {
        if ($this->isWaEnabledForTenant($tenant)) {
            return;
        }

        throw new PlanFeatureDisabledException(
            feature: 'whatsapp',
            planKey: $tenant->currentPlan?->key,
        );
    }
}
