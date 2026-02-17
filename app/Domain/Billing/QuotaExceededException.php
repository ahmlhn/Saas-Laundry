<?php

namespace App\Domain\Billing;

use Exception;

class QuotaExceededException extends Exception
{
    public function __construct(
        public readonly ?string $planKey,
        public readonly string $period,
        public readonly ?int $ordersLimit,
        public readonly int $ordersUsed,
    ) {
        parent::__construct('Monthly order quota has been exceeded.');
    }
}
