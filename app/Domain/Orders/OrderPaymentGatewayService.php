<?php

namespace App\Domain\Orders;

use App\Models\Order;
use App\Models\OrderPaymentEvent;
use App\Models\OrderPaymentIntent;
use App\Models\PaymentGatewaySetting;
use App\Models\Payment;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class OrderPaymentGatewayService
{
    public function createQrisIntent(
        Order $order,
        int $amountTotal,
        ?User $actor = null,
        bool $forceNew = false,
    ): OrderPaymentIntent {
        if ((int) $order->due_amount <= 0) {
            throw new RuntimeException('Order does not have remaining due amount.');
        }

        if ($amountTotal <= 0) {
            throw new RuntimeException('QRIS amount must be greater than zero.');
        }

        if ($amountTotal > (int) $order->due_amount) {
            throw new RuntimeException('QRIS amount exceeds current due amount.');
        }

        if (! $forceNew) {
            $existing = OrderPaymentIntent::query()
                ->where('order_id', $order->id)
                ->where('amount_total', $amountTotal)
                ->whereIn('status', ['created', 'ready'])
                ->where(function ($query): void {
                    $query->whereNull('expires_at')
                        ->orWhere('expires_at', '>', now());
                })
                ->latest('created_at')
                ->first();

            if ($existing) {
                return $existing;
            }
        }

        $expiresAt = $this->resolveIntentExpiry();
        $reference = $this->generateIntentReference($order);
        $gatewayIntent = $this->createDynamicQris($order, $amountTotal, $reference, $expiresAt);

        return DB::transaction(function () use ($actor, $gatewayIntent, $order, $amountTotal): OrderPaymentIntent {
            return OrderPaymentIntent::query()->create([
                'order_id' => $order->id,
                'tenant_id' => $order->tenant_id,
                'outlet_id' => $order->outlet_id,
                'provider' => 'bri_qris',
                'intent_reference' => (string) $gatewayIntent['reference'],
                'amount_total' => $amountTotal,
                'currency' => 'IDR',
                'status' => 'ready',
                'qris_payload' => (string) $gatewayIntent['qris_payload'],
                'expires_at' => $gatewayIntent['expires_at'],
                'requested_by' => $actor?->id,
                'gateway_response_json' => $gatewayIntent['response'],
            ]);
        });
    }

    /**
     * @return array{
     *     event: OrderPaymentEvent,
     *     duplicate: bool
     * }
     */
    public function processBriWebhook(string $rawPayload, ?string $signature): array
    {
        $payload = json_decode($rawPayload, true);
        if (! is_array($payload)) {
            $payload = [];
        }

        $normalized = $this->normalizeWebhookPayload($payload);
        $eventId = $normalized['event_id'] ?: 'evt-'.(string) Str::uuid();

        $existingEvent = OrderPaymentEvent::query()
            ->where('provider', 'bri_qris')
            ->where('gateway_event_id', $eventId)
            ->first();

        if ($existingEvent) {
            return [
                'event' => $existingEvent,
                'duplicate' => true,
            ];
        }

        $signatureValid = $this->isValidSignature($rawPayload, $signature);
        $event = OrderPaymentEvent::query()->create([
            'provider' => 'bri_qris',
            'gateway_event_id' => $eventId,
            'event_type' => $normalized['event_type'],
            'event_status' => $normalized['event_status'],
            'amount_total' => $normalized['amount_total'],
            'currency' => $normalized['currency'],
            'gateway_reference' => $normalized['gateway_reference'],
            'signature_valid' => $signatureValid,
            'process_status' => 'received',
            'rejection_reason' => null,
            'payload_json' => $payload,
            'received_at' => now(),
        ]);

        if (! $signatureValid) {
            $this->markEventProcessed($event, 'rejected', 'invalid_signature');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        $intent = $this->resolveIntentFromWebhook($normalized);
        if (! $intent) {
            $this->markEventProcessed($event, 'unmatched_intent', 'intent_not_found');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        $event->forceFill([
            'order_id' => $intent->order_id,
            'tenant_id' => $intent->tenant_id,
            'outlet_id' => $intent->outlet_id,
            'intent_id' => $intent->id,
        ])->save();

        if (! $normalized['is_success']) {
            $this->markEventProcessed($event, 'ignored_non_success');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        $amountTotal = $normalized['amount_total'];
        if ($amountTotal === null || $amountTotal <= 0) {
            $this->markEventProcessed($event, 'rejected', 'invalid_amount');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        if ((int) $intent->amount_total !== $amountTotal) {
            $this->markEventProcessed($event, 'amount_mismatch', 'amount_mismatch');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        DB::transaction(function () use ($event, $intent, $amountTotal): void {
            $lockedIntent = OrderPaymentIntent::query()
                ->whereKey($intent->id)
                ->lockForUpdate()
                ->first();

            if (! $lockedIntent) {
                $this->markEventProcessed($event, 'unmatched_intent', 'intent_not_found_after_lock');

                return;
            }

            $lockedOrder = Order::query()
                ->whereKey($lockedIntent->order_id)
                ->lockForUpdate()
                ->first();

            if (! $lockedOrder) {
                $this->markEventProcessed($event, 'unmatched_order', 'order_not_found');

                return;
            }

            $processStatus = 'accepted';

            if ($lockedIntent->status === 'paid' || (int) $lockedOrder->due_amount <= 0) {
                $processStatus = 'duplicate';
            } else {
                if ((int) $lockedIntent->amount_total !== $amountTotal) {
                    $this->markEventProcessed($event, 'amount_mismatch', 'amount_mismatch_after_lock');

                    return;
                }

                $amountToApply = min((int) $lockedIntent->amount_total, max((int) $lockedOrder->due_amount, 0));

                if ($amountToApply > 0) {
                    Payment::query()->create([
                        'order_id' => $lockedOrder->id,
                        'amount' => $amountToApply,
                        'method' => 'qris',
                        'paid_at' => now(),
                        'notes' => sprintf(
                            'BRI QRIS %s / %s',
                            $event->gateway_event_id,
                            (string) ($event->gateway_reference ?: $lockedIntent->intent_reference)
                        ),
                        'created_by' => null,
                        'updated_by' => null,
                        'source_channel' => 'system',
                    ]);
                } else {
                    $processStatus = 'duplicate';
                }

                $paidAmount = (int) Payment::query()->where('order_id', $lockedOrder->id)->sum('amount');
                $dueAmount = max((int) $lockedOrder->total_amount - $paidAmount, 0);

                $lockedOrder->forceFill([
                    'paid_amount' => $paidAmount,
                    'due_amount' => $dueAmount,
                    'updated_by' => null,
                    'source_channel' => 'system',
                ])->save();

                $lockedIntent->forceFill([
                    'status' => 'paid',
                ])->save();
            }

            $event->forceFill([
                'order_id' => $lockedOrder->id,
                'tenant_id' => $lockedOrder->tenant_id,
                'outlet_id' => $lockedOrder->outlet_id,
                'intent_id' => $lockedIntent->id,
                'process_status' => $processStatus,
                'rejection_reason' => null,
                'processed_at' => now(),
            ])->save();
        });

        return [
            'event' => $event->fresh(),
            'duplicate' => false,
        ];
    }

    private function resolveIntentExpiry(): CarbonInterface
    {
        $ttlMinutes = max((int) config('subscription.gateway_intent_ttl_minutes', 1440), 15);

        return now()->addMinutes($ttlMinutes);
    }

    private function generateIntentReference(Order $order): string
    {
        return sprintf(
            'ORDPAY-%s-%s',
            Str::upper(Str::slug($order->order_code, '')),
            strtoupper(Str::random(8))
        );
    }

    /**
     * @return array{
     *     reference: string,
     *     qris_payload: string,
     *     expires_at: CarbonInterface,
     *     response: array<string, mixed>
     * }
     */
    private function createDynamicQris(
        Order $order,
        int $amountTotal,
        string $reference,
        CarbonInterface $expiresAt,
    ): array {
        $credentials = $this->resolveBriCredentials($order);
        $baseUrl = $credentials['base_url'];
        $clientId = $credentials['client_id'];
        $clientSecret = $credentials['client_secret'];
        $merchantId = $credentials['merchant_id'];

        if ($baseUrl === '' || $clientId === '' || $clientSecret === '' || $merchantId === '') {
            return $this->buildSimulatedIntent($order, $amountTotal, $reference, $expiresAt);
        }

        $endpoint = rtrim($baseUrl, '/').'/qris/intents';
        $requestPayload = [
            'merchant_id' => $merchantId,
            'reference' => $reference,
            'invoice_no' => $order->order_code,
            'amount_total' => $amountTotal,
            'currency' => 'IDR',
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
        Order $order,
        int $amountTotal,
        string $reference,
        CarbonInterface $expiresAt,
    ): array {
        $payload = sprintf(
            'QRIS|SIMULATED|%s|%s|%d|%s',
            $order->order_code,
            $reference,
            $amountTotal,
            strtoupper(Str::random(12))
        );

        return [
            'reference' => $reference,
            'qris_payload' => $payload,
            'expires_at' => $expiresAt,
            'response' => [
                'provider' => 'simulated',
                'order_code' => $order->order_code,
                'reference' => $reference,
                'qris_payload' => $payload,
                'expired_at' => $expiresAt->toIso8601String(),
            ],
        ];
    }

    /**
     * @return array{
     *     base_url: string,
     *     client_id: string,
     *     client_secret: string,
     *     merchant_id: string
     * }
     */
    private function resolveBriCredentials(Order $order): array
    {
        $baseUrl = trim((string) config('subscription.bri.api_base_url'));
        $merchantId = trim((string) config('subscription.bri.merchant_id'));
        $clientId = trim((string) config('subscription.bri.client_id'));
        $clientSecret = trim((string) config('subscription.bri.client_secret'));

        $settings = PaymentGatewaySetting::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('outlet_id', $order->outlet_id)
            ->where('provider', 'bri_qris')
            ->first();

        if ($settings) {
            $configuredClientId = trim((string) ($settings->client_id ?? ''));
            $configuredClientSecret = trim((string) ($settings->client_secret ?? ''));

            if ($configuredClientId !== '') {
                $clientId = $configuredClientId;
            }

            if ($configuredClientSecret !== '') {
                $clientSecret = $configuredClientSecret;
            }
        }

        return [
            'base_url' => $baseUrl,
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'merchant_id' => $merchantId,
        ];
    }

    private function markEventProcessed(
        OrderPaymentEvent $event,
        string $status,
        ?string $reason = null,
    ): void {
        $event->forceFill([
            'process_status' => $status,
            'rejection_reason' => $reason,
            'processed_at' => now(),
        ])->save();
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{
     *     event_id: string,
     *     event_type: string,
     *     event_status: string,
     *     order_id: string,
     *     order_code: string,
     *     amount_total: int|null,
     *     currency: string,
     *     gateway_reference: string,
     *     is_success: bool
     * }
     */
    private function normalizeWebhookPayload(array $payload): array
    {
        $eventType = strtolower($this->extractString($payload, ['event_type', 'type', 'data.event_type']) ?: 'payment_notification');
        $eventStatus = strtolower($this->extractString($payload, ['status', 'event_status', 'transaction_status', 'data.status']) ?: 'unknown');
        $isPaidFlag = $this->extractBool($payload, ['is_paid', 'paid', 'data.is_paid']);
        $isSuccess = $isPaidFlag
            || in_array($eventStatus, ['paid', 'success', 'settled', 'settlement', 'completed'], true)
            || str_contains($eventType, 'paid')
            || str_contains($eventType, 'settlement');

        return [
            'event_id' => $this->extractString($payload, ['event_id', 'id', 'trx_id', 'transaction_id', 'data.event_id']) ?: '',
            'event_type' => $eventType,
            'event_status' => $eventStatus,
            'order_id' => $this->extractString($payload, ['order_id', 'data.order_id', 'metadata.order_id']) ?: '',
            'order_code' => $this->extractString($payload, ['order_code', 'invoice_no', 'merchant_trx_id', 'data.order_code']) ?: '',
            'amount_total' => $this->extractInt($payload, ['amount_total', 'amount', 'paid_amount', 'data.amount']),
            'currency' => strtoupper($this->extractString($payload, ['currency', 'data.currency']) ?: 'IDR'),
            'gateway_reference' => $this->extractString($payload, ['gateway_reference', 'reference', 'rrn', 'trx_id', 'transaction_id', 'data.reference']) ?: '',
            'is_success' => $isSuccess,
        ];
    }

    /**
     * @param array<string, mixed> $normalized
     */
    private function resolveIntentFromWebhook(array $normalized): ?OrderPaymentIntent
    {
        $reference = trim((string) ($normalized['gateway_reference'] ?? ''));
        if ($reference !== '') {
            $intent = OrderPaymentIntent::query()
                ->where('intent_reference', $reference)
                ->latest('created_at')
                ->first();
            if ($intent) {
                return $intent;
            }
        }

        $orderId = trim((string) ($normalized['order_id'] ?? ''));
        if ($orderId !== '') {
            $intent = OrderPaymentIntent::query()
                ->where('order_id', $orderId)
                ->whereIn('status', ['created', 'ready', 'paid'])
                ->latest('created_at')
                ->first();
            if ($intent) {
                return $intent;
            }
        }

        $orderCode = trim((string) ($normalized['order_code'] ?? ''));
        if ($orderCode !== '') {
            $order = Order::query()->where('order_code', $orderCode)->first();
            if ($order) {
                return OrderPaymentIntent::query()
                    ->where('order_id', $order->id)
                    ->whereIn('status', ['created', 'ready', 'paid'])
                    ->latest('created_at')
                    ->first();
            }
        }

        return null;
    }

    private function isValidSignature(string $rawPayload, ?string $signature): bool
    {
        $secret = trim((string) config('subscription.bri.webhook_secret'));
        $provided = trim((string) $signature);

        if ($secret === '') {
            return app()->environment('local', 'testing');
        }

        if ($provided === '') {
            return false;
        }

        if (str_starts_with(strtolower($provided), 'sha256=')) {
            $provided = substr($provided, 7);
        }

        $expectedHex = hash_hmac('sha256', $rawPayload, $secret);
        $expectedBase64 = base64_encode(hex2bin($expectedHex) ?: '');

        return hash_equals($expectedHex, $provided)
            || hash_equals($expectedBase64, $provided);
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
     * @param array<int, string> $paths
     */
    private function extractInt(array $payload, array $paths): ?int
    {
        $raw = $this->extractString($payload, $paths);
        if ($raw === null) {
            return null;
        }

        if (preg_match('/^-?\d+$/', $raw) === 1) {
            return (int) $raw;
        }

        if (is_numeric($raw)) {
            return (int) round((float) $raw);
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<int, string> $paths
     */
    private function extractBool(array $payload, array $paths): bool
    {
        $raw = $this->extractString($payload, $paths);
        if ($raw === null) {
            return false;
        }

        return in_array(strtolower($raw), ['1', 'true', 'yes', 'paid'], true);
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
