<?php

namespace App\Domain\Sync;

use Exception;

class SyncRejectException extends Exception
{
    /**
     * @param array<string, mixed>|null $currentState
     */
    public function __construct(
        public readonly string $reasonCode,
        string $message,
        public readonly ?array $currentState = null,
    ) {
        parent::__construct($message);
    }
}
