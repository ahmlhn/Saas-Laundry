<?php

namespace App\Http\Controllers\Api;

use App\Domain\Orders\OrderPaymentGatewayService;
use App\Domain\Subscription\SubscriptionPaymentGatewayService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BriPaymentWebhookController extends Controller
{
    public function __construct(
        private readonly SubscriptionPaymentGatewayService $paymentGatewayService,
        private readonly OrderPaymentGatewayService $orderPaymentGatewayService,
    ) {
    }

    public function qris(Request $request): JsonResponse
    {
        $rawPayload = $request->getContent();
        $signature = $request->header('X-BRI-Signature');
        $payload = json_decode($rawPayload, true);
        $gatewayReference = is_array($payload)
            ? ($this->extractString($payload, ['gateway_reference', 'reference', 'rrn', 'trx_id', 'transaction_id', 'data.reference']) ?: '')
            : '';
        $isOrderPayment = str_starts_with(strtoupper($gatewayReference), 'ORDPAY-');

        $result = $isOrderPayment
            ? $this->orderPaymentGatewayService->processBriWebhook(rawPayload: $rawPayload, signature: $signature)
            : $this->paymentGatewayService->processBriWebhook(rawPayload: $rawPayload, signature: $signature);

        $event = $result['event'];

        return response()->json([
            'ok' => true,
            'target' => $isOrderPayment ? 'order' : 'subscription',
            'duplicate' => (bool) $result['duplicate'],
            'event' => [
                'id' => $event->id ?? null,
                'gateway_event_id' => $event->gateway_event_id ?? null,
                'process_status' => $event->process_status ?? null,
                'rejection_reason' => $event->rejection_reason ?? null,
                'invoice_id' => $event->invoice_id ?? null,
                'order_id' => $event->order_id ?? null,
                'tenant_id' => $event->tenant_id ?? null,
            ],
        ], 202);
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
