<?php

namespace App\Domain\Messaging;

use Exception;

class WaProviderException extends Exception
{
    public function __construct(
        public readonly string $reasonCode,
        string $message,
        public readonly bool $transient = false,
    ) {
        parent::__construct($message);
    }
}
