<?php

namespace App\Domain\Messaging\Providers;

use App\Domain\Messaging\Contracts\WaProviderDriver;
use App\Domain\Messaging\WaProviderException;
use Illuminate\Support\Str;

class MockWaProvider implements WaProviderDriver
{
    public function key(): string
    {
        return 'mock';
    }

    public function healthCheck(array $credentials = []): array
    {
        return [
            'ok' => true,
            'message' => 'mock provider ready',
        ];
    }

    public function sendText(string $toPhone, string $text, array $credentials = [], array $metadata = []): array
    {
        $failureMode = strtolower((string) ($metadata['mock_failure'] ?? ''));

        if ($failureMode === 'transient') {
            throw new WaProviderException(
                reasonCode: 'NETWORK_ERROR',
                message: 'Mock transient network issue.',
                transient: true,
            );
        }

        if ($failureMode === 'permanent') {
            throw new WaProviderException(
                reasonCode: 'PHONE_INVALID',
                message: 'Mock permanent phone error.',
                transient: false,
            );
        }

        if (! preg_match('/^62\d{7,14}$/', $toPhone)) {
            throw new WaProviderException(
                reasonCode: 'PHONE_INVALID',
                message: 'Destination phone number is invalid.',
                transient: false,
            );
        }

        if (trim($text) === '') {
            throw new WaProviderException(
                reasonCode: 'EMPTY_MESSAGE',
                message: 'Message body is empty.',
                transient: false,
            );
        }

        return [
            'provider_message_id' => 'mock-'.Str::lower(Str::random(16)),
        ];
    }
}
