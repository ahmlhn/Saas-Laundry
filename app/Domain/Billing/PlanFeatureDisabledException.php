<?php

namespace App\Domain\Billing;

use Exception;

class PlanFeatureDisabledException extends Exception
{
    public function __construct(
        public readonly string $feature,
        public readonly ?string $planKey,
    ) {
        parent::__construct('Feature is not available for the current subscription plan.');
    }
}
