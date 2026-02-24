<?php

namespace App\Domain\Subscription;

use App\Models\SubscriptionInvoice;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class BriQrisGatewayClient
{
    /**
     * @return array{
     *     reference: string,
     *     qris_payload: string,
     *     expires_at: CarbonInterface,
     *     response: array<string, mixed>
     * }
     */
    public function createDynamicQris(
        SubscriptionInvoice $invoice,
        string $reference,
        CarbonInterface $expiresAt,
    ): array {
        $baseUrl = trim((string) config('subscription.bri.api_base_url'));
        $clientId = trim((string) config('subscription.bri.client_id'));
        $clientSecret = trim((string) config('subscription.bri.client_secret'));
        $merchantId = trim((string) config('subscription.bri.merchant_id'));

        if ($baseUrl === '' || $clientId === '' || $clientSecret === '' || $merchantId === '') {
            return $this->buildSimulatedIntent($invoice, $reference, $expiresAt);
        }

        $endpoint = rtrim($baseUrl, '/').'/qris/intents';
        $requestPayload = [
            'merchant_id' => $merchantId,
            'reference' => $reference,
            'invoice_no' => $invoice->invoice_no,
            'amount_total' => (int) $invoice->amount_total,
            'currency' => (string) ($invoice->currency ?: 'IDR'),
            'expires_at' => $expiresAt->toIso8601String(),
        ];

        $response = Http::timeout(20)
            ->acceptJson()
            ->asJson()
            ->withBasicAuth($clientId, $clientSecret)
            ->withHeaders([
                'X-BRI-Merchant-Id' => $merchantId,
            ])
            ->post($endpoint, $requestPayload);

        if (! $response->successful()) {
            throw new RuntimeException('BRI QRIS intent request failed with HTTP '.$response->status().'.');
        }

        $responsePayload = $response->json();
        if (! is_array($responsePayload)) {
            throw new RuntimeException('BRI QRIS intent response is invalid.');
        }

        $resolvedReference = $this->extractString($responsePayload, ['reference', 'gateway_reference', 'data.reference']) ?: $reference;
        $resolvedQrisPayload = $this->extractString($responsePayload, ['qris_payload', 'qr_string', 'data.qris_payload', 'data.qr_string']);
        if ($resolvedQrisPayload === null) {
            throw new RuntimeException('BRI QRIS response does not include qris payload.');
        }

        $resolvedExpiresAt = $this->extractString($responsePayload, ['qris_expired_at', 'expired_at', 'data.expired_at']);
        $expires = $expiresAt;
        if ($resolvedExpiresAt) {
            try {
                $expires = Carbon::parse($resolvedExpiresAt);
            } catch (\Throwable) {
                $expires = $expiresAt;
            }
        }

        return [
            'reference' => $resolvedReference,
            'qris_payload' => $resolvedQrisPayload,
            'expires_at' => $expires,
            'response' => $responsePayload,
        ];
    }

    /**
     * @return array{
     *     reference: string,
     *     qris_payload: string,
     *     expires_at: CarbonInterface,
     *     response: array<string, mixed>
     * }
     */
    private function buildSimulatedIntent(
        SubscriptionInvoice $invoice,
        string $reference,
        CarbonInterface $expiresAt,
    ): array {
        $payload = sprintf(
            'QRIS|SIMULATED|%s|%s|%d|%s',
            $invoice->invoice_no,
            $reference,
            (int) $invoice->amount_total,
            strtoupper(Str::random(12))
        );

        return [
            'reference' => $reference,
            'qris_payload' => $payload,
            'expires_at' => $expiresAt,
            'response' => [
                'provider' => 'simulated',
                'invoice_no' => $invoice->invoice_no,
                'reference' => $reference,
                'qris_payload' => $payload,
                'expired_at' => $expiresAt->toIso8601String(),
            ],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, string> $paths
     */
    private function extractString(array $payload, array $paths): ?string
    {
        foreach ($paths as $path) {
            $value = $this->extractByPath($payload, $path);
            if (! is_scalar($value)) {
                continue;
            }

            $string = trim((string) $value);
            if ($string !== '') {
                return $string;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function extractByPath(array $payload, string $path): mixed
    {
        if (! str_contains($path, '.')) {
            return $payload[$path] ?? null;
        }

        $current = $payload;
        foreach (explode('.', $path) as $segment) {
            if (! is_array($current) || ! array_key_exists($segment, $current)) {
                return null;
            }

            $current = $current[$segment];
        }

        return $current;
    }
}
