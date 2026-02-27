<?php

namespace App\Domain\Messaging\Providers;

use App\Domain\Messaging\Contracts\WaProviderDriver;
use App\Domain\Messaging\WaProviderException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class MpwaProvider implements WaProviderDriver
{
    public function key(): string
    {
        return 'mpwa';
    }

    public function healthCheck(array $credentials = []): array
    {
        $resolved = $this->resolveConfig($credentials);

        if ($resolved['api_key'] === '') {
            throw new WaProviderException(
                reasonCode: 'CREDENTIALS_INVALID',
                message: 'MPWA_API_KEY di .env wajib diisi.',
                transient: false,
            );
        }

        if ($resolved['sender'] === '') {
            throw new WaProviderException(
                reasonCode: 'CREDENTIALS_INVALID',
                message: 'MPWA sender/device wajib diisi.',
                transient: false,
            );
        }

        if ($resolved['base_url'] === '') {
            throw new WaProviderException(
                reasonCode: 'CREDENTIALS_INVALID',
                message: 'MPWA_BASE_URL di .env wajib diisi.',
                transient: false,
            );
        }

        return [
            'ok' => true,
            'message' => 'mpwa credentials ready',
        ];
    }

    public function sendText(string $toPhone, string $text, array $credentials = [], array $metadata = []): array
    {
        $resolved = $this->resolveConfig($credentials);
        $apiKey = $resolved['api_key'];
        $sender = $resolved['sender'];
        $baseUrl = $resolved['base_url'];
        $sendPath = $resolved['send_path'];
        $timeoutSeconds = $resolved['timeout_seconds'];

        if ($apiKey === '' || $sender === '' || $baseUrl === '') {
            throw new WaProviderException(
                reasonCode: 'CREDENTIALS_INVALID',
                message: 'Konfigurasi MPWA belum lengkap (MPWA_API_KEY, sender, MPWA_BASE_URL).',
                transient: false,
            );
        }

        $normalizedPhone = $this->normalizePhone($toPhone);
        if ($normalizedPhone === '') {
            throw new WaProviderException(
                reasonCode: 'PHONE_INVALID',
                message: 'Destination phone number is invalid.',
                transient: false,
            );
        }

        $message = trim($text);
        if ($message === '') {
            throw new WaProviderException(
                reasonCode: 'EMPTY_MESSAGE',
                message: 'Message body is empty.',
                transient: false,
            );
        }

        $endpoint = rtrim($baseUrl, '/').'/'.ltrim($sendPath, '/');

        try {
            $response = Http::asForm()
                ->acceptJson()
                ->timeout($timeoutSeconds)
                ->post($endpoint, [
                    'api_key' => $apiKey,
                    'sender' => $sender,
                    'number' => $normalizedPhone,
                    'message' => $message,
                ]);
        } catch (\Throwable $error) {
            throw new WaProviderException(
                reasonCode: 'NETWORK_ERROR',
                message: 'MPWA request failed: '.$error->getMessage(),
                transient: true,
            );
        }

        if ($response->serverError()) {
            throw new WaProviderException(
                reasonCode: 'GATEWAY_5XX',
                message: 'MPWA gateway returned server error.',
                transient: true,
            );
        }

        if ($response->clientError()) {
            throw new WaProviderException(
                reasonCode: 'GATEWAY_4XX',
                message: $this->extractProviderErrorMessage($response->json()) ?? 'MPWA gateway rejected request.',
                transient: false,
            );
        }

        if (! $response->ok()) {
            throw new WaProviderException(
                reasonCode: 'GATEWAY_REQUEST_FAILED',
                message: 'MPWA gateway request failed.',
                transient: true,
            );
        }

        $payload = $response->json();
        if (is_array($payload)) {
            $status = $payload['status'] ?? $payload['success'] ?? null;
            if ($status === false || $status === 0 || $status === '0' || $status === 'false') {
                throw new WaProviderException(
                    reasonCode: 'GATEWAY_REJECTED',
                    message: $this->extractProviderErrorMessage($payload) ?? 'MPWA rejected message.',
                    transient: false,
                );
            }
        }

        $providerMessageId = $this->extractProviderMessageId($payload);

        return [
            'provider_message_id' => $providerMessageId ?: 'mpwa-'.Str::lower(Str::random(18)),
        ];
    }

    /**
     * @param array<string, mixed> $credentials
     * @return array{
     *   api_key: string,
     *   sender: string,
     *   base_url: string,
     *   send_path: string,
     *   timeout_seconds: int
     * }
     */
    private function resolveConfig(array $credentials): array
    {
        $sender = $this->stringValue($credentials, ['sender', 'device', 'device_id']);
        $apiKey = trim((string) config('services.mpwa.api_key', ''));
        $baseUrl = trim((string) config('services.mpwa.base_url', ''));
        $sendPath = trim((string) config('services.mpwa.send_path', '/send-message'));

        if ($sender === '') {
            $sender = trim((string) config('services.mpwa.sender', ''));
        }

        $timeoutSeconds = max((int) config('services.mpwa.timeout_seconds', 15), 5);

        return [
            'api_key' => $apiKey,
            'sender' => $sender,
            'base_url' => $baseUrl,
            'send_path' => $sendPath !== '' ? $sendPath : '/send-message',
            'timeout_seconds' => $timeoutSeconds,
        ];
    }

    private function normalizePhone(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';
        if ($digits === '') {
            return '';
        }

        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }

        if (str_starts_with($digits, '0')) {
            $digits = '62'.ltrim($digits, '0');
        } elseif (str_starts_with($digits, '8')) {
            $digits = '62'.$digits;
        }

        if (! preg_match('/^62\d{7,14}$/', $digits)) {
            return '';
        }

        return $digits;
    }

    /**
     * @param array<string, mixed>|mixed $payload
     */
    private function extractProviderMessageId(mixed $payload): ?string
    {
        if (! is_array($payload)) {
            return null;
        }

        $candidate = $this->stringValue($payload, ['message_id', 'id', 'data.message_id', 'data.id', 'result.message_id', 'result.id']);

        return $candidate !== '' ? $candidate : null;
    }

    /**
     * @param array<string, mixed>|mixed $payload
     */
    private function extractProviderErrorMessage(mixed $payload): ?string
    {
        if (! is_array($payload)) {
            return null;
        }

        $candidate = $this->stringValue($payload, ['message', 'error', 'errors.0.message', 'data.message', 'result.message']);

        return $candidate !== '' ? $candidate : null;
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, string> $paths
     */
    private function stringValue(array $payload, array $paths): string
    {
        foreach ($paths as $path) {
            $value = $this->pathValue($payload, $path);
            if (is_scalar($value)) {
                $trimmed = trim((string) $value);
                if ($trimmed !== '') {
                    return $trimmed;
                }
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function pathValue(array $payload, string $path): mixed
    {
        if (! str_contains($path, '.')) {
            return $payload[$path] ?? null;
        }

        $segments = explode('.', $path);
        $current = $payload;

        foreach ($segments as $segment) {
            if (is_array($current) && array_key_exists($segment, $current)) {
                $current = $current[$segment];
                continue;
            }

            if (is_array($current) && ctype_digit($segment)) {
                $index = (int) $segment;
                if (array_key_exists($index, $current)) {
                    $current = $current[$index];
                    continue;
                }
            }

            return null;
        }

        return $current;
    }
}
