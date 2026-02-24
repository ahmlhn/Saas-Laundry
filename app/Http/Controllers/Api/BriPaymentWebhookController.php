<?php

namespace App\Http\Controllers\Api;

use App\Domain\Subscription\SubscriptionPaymentGatewayService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BriPaymentWebhookController extends Controller
{
    public function __construct(
        private readonly SubscriptionPaymentGatewayService $paymentGatewayService,
    ) {
    }

    public function qris(Request $request): JsonResponse
    {
        $result = $this->paymentGatewayService->processBriWebhook(
            rawPayload: $request->getContent(),
            signature: $request->header('X-BRI-Signature')
        );

        $event = $result['event'];

        return response()->json([
            'ok' => true,
            'duplicate' => (bool) $result['duplicate'],
            'event' => [
                'id' => $event->id,
                'gateway_event_id' => $event->gateway_event_id,
                'process_status' => $event->process_status,
                'rejection_reason' => $event->rejection_reason,
                'invoice_id' => $event->invoice_id,
                'tenant_id' => $event->tenant_id,
            ],
        ], 202);
    }
}
