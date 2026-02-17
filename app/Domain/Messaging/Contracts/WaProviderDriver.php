<?php

namespace App\Domain\Messaging\Contracts;

interface WaProviderDriver
{
    public function key(): string;

    /**
     * @param array<string, mixed> $credentials
     * @return array{ok: bool, message: string}
     */
    public function healthCheck(array $credentials = []): array;

    /**
     * @param array<string, mixed> $credentials
     * @param array<string, mixed> $metadata
     * @return array{provider_message_id: string}
     */
    public function sendText(string $toPhone, string $text, array $credentials = [], array $metadata = []): array;
}
