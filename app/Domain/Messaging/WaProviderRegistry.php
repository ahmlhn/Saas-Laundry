<?php

namespace App\Domain\Messaging;

use App\Domain\Messaging\Contracts\WaProviderDriver;
use App\Domain\Messaging\Providers\MockWaProvider;

class WaProviderRegistry
{
    public function __construct(
        private readonly MockWaProvider $mockProvider,
    ) {
    }

    public function driverForKey(string $providerKey): WaProviderDriver
    {
        return match (strtolower($providerKey)) {
            'mock' => $this->mockProvider,
            default => throw new WaProviderException(
                reasonCode: 'PROVIDER_NOT_SUPPORTED',
                message: "WA provider '{$providerKey}' is not supported.",
                transient: false,
            ),
        };
    }
}
