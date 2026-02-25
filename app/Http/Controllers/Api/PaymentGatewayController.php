<?php

namespace App\Http\Controllers\Api;

use App\Domain\Audit\AuditEventKeys;
use App\Domain\Audit\AuditTrailService;
use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\OrderPaymentEvent;
use App\Models\OrderPaymentIntent;
use App\Models\PaymentGatewaySetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

class PaymentGatewayController extends Controller
{
    use EnsuresApiAccess;

    public function __construct(
        private readonly AuditTrailService $auditTrail,
    ) {
    }

    public function showSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);

        $settings = PaymentGatewaySetting::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $outlet->id)
            ->where('provider', 'bri_qris')
            ->first();

        return response()->json([
            'data' => $this->serializeSettings($settings, $outlet->id),
        ]);
    }

    public function upsertSettings(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'client_id' => ['required', 'string', 'max:120'],
            'client_secret' => ['nullable', 'string', 'max:255'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $sourceChannel = $this->resolveSourceChannel($request, 'mobile');

        $settings = PaymentGatewaySetting::query()->firstOrNew([
            'tenant_id' => $user->tenant_id,
            'outlet_id' => $outlet->id,
            'provider' => 'bri_qris',
        ]);

        $hasClientSecretField = $request->exists('client_secret');
        $incomingClientSecret = trim((string) ($validated['client_secret'] ?? ''));
        $nextClientId = trim((string) $validated['client_id']);

        if (! $settings->exists && (! $hasClientSecretField || $incomingClientSecret === '')) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Client secret wajib diisi saat pertama kali konfigurasi.',
                'errors' => [
                    'client_secret' => ['Client secret wajib diisi saat pertama kali konfigurasi.'],
                ],
            ], 422);
        }

        $settings->client_id = $nextClientId;

        if ($hasClientSecretField && $incomingClientSecret !== '') {
            $settings->client_secret = $incomingClientSecret;
        }

        if (blank((string) $settings->client_secret)) {
            return response()->json([
                'reason_code' => 'VALIDATION_FAILED',
                'message' => 'Client secret belum tersedia. Isi client secret untuk melanjutkan.',
                'errors' => [
                    'client_secret' => ['Client secret belum tersedia. Isi client secret untuk melanjutkan.'],
                ],
            ], 422);
        }

        $settings->save();

        $this->auditTrail->record(
            eventKey: AuditEventKeys::PAYMENT_GATEWAY_SETTINGS_UPDATED,
            actor: $user,
            tenantId: $user->tenant_id,
            outletId: $outlet->id,
            entityType: 'payment_gateway_settings',
            entityId: $settings->id,
            metadata: [
                'provider' => 'bri_qris',
                'source_channel' => $sourceChannel,
                'client_id' => $nextClientId,
                'client_secret_changed' => $hasClientSecretField && $incomingClientSecret !== '',
            ],
            channel: 'api',
            request: $request,
        );

        return response()->json([
            'data' => $this->serializeSettings($settings, $outlet->id),
        ]);
    }

    public function qrisTransactions(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier']);

        $validated = $request->validate([
            'outlet_id' => ['required', 'uuid'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $outlet = $this->ensureOutletAccess($user, $validated['outlet_id']);
        $limit = (int) ($validated['limit'] ?? 30);

        $settings = PaymentGatewaySetting::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $outlet->id)
            ->where('provider', 'bri_qris')
            ->first();

        $intents = OrderPaymentIntent::query()
            ->with(['order:id,order_code,customer_id', 'order.customer:id,name,phone_normalized'])
            ->where('tenant_id', $user->tenant_id)
            ->where('outlet_id', $outlet->id)
            ->where('provider', 'bri_qris')
            ->latest('created_at')
            ->limit($limit)
            ->get();

        $eventsByIntentId = $this->mapLatestEventsByIntent($intents->pluck('id')->all());

        $transactions = $intents->map(function (OrderPaymentIntent $intent) use ($eventsByIntentId): array {
            $latestEvent = $eventsByIntentId->get($intent->id);
            $order = $intent->order;
            $customer = $order?->customer;

            return [
                'intent_id' => $intent->id,
                'order_id' => $intent->order_id,
                'order_code' => $order?->order_code,
                'customer_name' => $customer?->name,
                'customer_phone' => $customer?->phone_normalized,
                'intent_reference' => $intent->intent_reference,
                'amount_total' => (int) $intent->amount_total,
                'currency' => (string) $intent->currency,
                'intent_status' => (string) $intent->status,
                'is_paid' => $intent->status === 'paid',
                'expires_at' => $intent->expires_at?->toIso8601String(),
                'created_at' => $intent->created_at?->toIso8601String(),
                'updated_at' => $intent->updated_at?->toIso8601String(),
                'latest_event' => $latestEvent ? [
                    'id' => $latestEvent->id,
                    'gateway_event_id' => $latestEvent->gateway_event_id,
                    'event_type' => $latestEvent->event_type,
                    'event_status' => $latestEvent->event_status,
                    'process_status' => $latestEvent->process_status,
                    'rejection_reason' => $latestEvent->rejection_reason,
                    'received_at' => $latestEvent->received_at?->toIso8601String(),
                    'processed_at' => $latestEvent->processed_at?->toIso8601String(),
                ] : null,
            ];
        })->values();

        return response()->json([
            'data' => [
                'settings' => $this->serializeSettings($settings, $outlet->id),
                'summary' => [
                    'total' => $transactions->count(),
                    'paid' => $transactions->where('is_paid', true)->count(),
                    'pending' => $transactions->where('is_paid', false)->count(),
                ],
                'transactions' => $transactions,
            ],
        ]);
    }

    private function resolveSourceChannel(Request $request, string $fallback = 'web'): string
    {
        $raw = strtolower((string) $request->header('X-Source-Channel', $fallback));

        return in_array($raw, ['mobile', 'web', 'system'], true) ? $raw : $fallback;
    }

    /**
     * @param array<int, string> $intentIds
     * @return Collection<string, OrderPaymentEvent>
     */
    private function mapLatestEventsByIntent(array $intentIds): Collection
    {
        if ($intentIds === []) {
            return collect();
        }

        return OrderPaymentEvent::query()
            ->whereIn('intent_id', $intentIds)
            ->orderByDesc('received_at')
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('intent_id')
            ->map(fn (Collection $events): ?OrderPaymentEvent => $events->first())
            ->filter(fn (?OrderPaymentEvent $event): bool => $event instanceof OrderPaymentEvent);
    }

    /**
     * @return array{
     *     provider: string,
     *     outlet_id: string,
     *     client_id: string,
     *     client_secret_mask: string,
     *     has_client_secret: bool,
     *     updated_at: string|null
     * }
     */
    private function serializeSettings(?PaymentGatewaySetting $settings, string $outletId): array
    {
        $clientId = trim((string) ($settings?->client_id ?? ''));
        $clientSecret = trim((string) ($settings?->client_secret ?? ''));

        return [
            'provider' => 'bri_qris',
            'outlet_id' => $outletId,
            'client_id' => $clientId,
            'client_secret_mask' => $this->maskSecret($clientSecret),
            'has_client_secret' => $clientSecret !== '',
            'updated_at' => $settings?->updated_at?->toIso8601String(),
        ];
    }

    private function maskSecret(string $secret): string
    {
        $length = strlen($secret);
        if ($length === 0) {
            return '';
        }

        if ($length <= 6) {
            return str_repeat('*', $length);
        }

        return substr($secret, 0, 3)
            .str_repeat('*', max($length - 6, 4))
            .substr($secret, -3);
    }
}

