<?php

namespace App\Domain\Billing;

use Exception;

class TenantWriteAccessException extends Exception
{
    public function __construct(
        public readonly ?string $subscriptionState,
        public readonly ?string $writeAccessMode,
    ) {
        parent::__construct('Tenant write access is currently restricted.');
    }
}
