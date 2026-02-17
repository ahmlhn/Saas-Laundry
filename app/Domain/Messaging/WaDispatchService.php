<?php

namespace App\Domain\Messaging;

use App\Domain\Billing\PlanFeatureGateService;
use App\Jobs\SendWaMessageJob;
use App\Models\Order;
use App\Models\WaMessage;
use App\Models\WaProviderConfig;
use Illuminate\Support\Facades\Log;

class WaDispatchService
{
    public function __construct(
        private readonly PlanFeatureGateService $planFeatureGate,
        private readonly WaTemplateResolver $templateResolver,
        private readonly WaTemplateRenderer $templateRenderer,
    ) {
    }

    /**
     * @param array<string, mixed> $variables
     * @param array<string, mixed> $metadata
     */
    public function enqueueOrderEvent(Order $order, string $templateId, array $variables = [], array $metadata = []): ?WaMessage
    {
        $order->loadMissing([
            'tenant.currentPlan:id,key,orders_limit',
            'customer:id,name,phone_normalized',
            'outlet:id,name,code',
            'courier:id,name,phone',
        ]);

        $tenant = $order->tenant;

        if (! $tenant || ! $this->planFeatureGate->isWaEnabledForTenant($tenant)) {
            return null;
        }

        $toPhone = (string) ($order->customer?->phone_normalized ?? '');
        $invoiceOrCode = (string) ($order->invoice_no ?: $order->order_code);

        if ($toPhone === '' || $invoiceOrCode === '') {
            return null;
        }

        $idempotencySuffixRaw = $metadata['idempotency_suffix'] ?? null;
        $idempotencySuffix = is_scalar($idempotencySuffixRaw)
            ? trim((string) $idempotencySuffixRaw)
            : '';

        $idempotencyKey = $this->buildIdempotencyKey(
            tenantId: $order->tenant_id,
            outletId: $order->outlet_id,
            invoiceOrCode: $invoiceOrCode,
            templateId: $templateId,
            suffix: $idempotencySuffix,
        );

        $existing = WaMessage::query()
            ->where('tenant_id', $order->tenant_id)
            ->where('idempotency_key', $idempotencyKey)
            ->first();

        if ($existing) {
            return $existing;
        }

        try {
            $resolvedTemplate = $this->templateResolver->resolveForTenant(
                tenantId: $order->tenant_id,
                outletId: $order->outlet_id,
                templateId: $templateId,
            );

            $payloadVariables = array_merge($this->baseVariables($order), $variables);
            $rendered = $this->templateRenderer->render($resolvedTemplate['definition'], $payloadVariables);
            $actorUserId = $this->resolveActorUserId($metadata);
            $sourceChannel = $this->resolveSourceChannel($metadata);

            $activeConfig = WaProviderConfig::query()
                ->where('tenant_id', $order->tenant_id)
                ->where('is_active', true)
                ->orderByDesc('updated_at')
                ->first();

            $message = WaMessage::query()->create([
                'tenant_id' => $order->tenant_id,
                'outlet_id' => $order->outlet_id,
                'order_id' => $order->id,
                'provider_id' => $activeConfig?->provider_id,
                'template_id' => $templateId,
                'idempotency_key' => $idempotencyKey,
                'to_phone' => $toPhone,
                'body_text' => $rendered['body_text'],
                'status' => 'queued',
                'attempts' => 0,
                'metadata_json' => array_merge(
                    $metadata,
                    [
                        'template_source' => $resolvedTemplate['source'],
                        'template_version' => $resolvedTemplate['version'],
                    ]
                ),
                'created_by' => $actorUserId,
                'updated_by' => $actorUserId,
                'source_channel' => $sourceChannel,
            ]);

            SendWaMessageJob::dispatch($message->id)->onQueue('messaging');

            return $message;
        } catch (\Throwable $e) {
            Log::warning('wa_dispatch_failed', [
                'order_id' => $order->id,
                'template_id' => $templateId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function buildIdempotencyKey(
        string $tenantId,
        string $outletId,
        string $invoiceOrCode,
        string $templateId,
        string $suffix = '',
    ): string
    {
        $parts = [
            $tenantId,
            $outletId,
            $invoiceOrCode,
            $templateId,
        ];

        if ($suffix !== '') {
            $parts[] = str_replace(':', '-', $suffix);
        }

        return implode(':', $parts);
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private function resolveActorUserId(array $metadata): ?int
    {
        if (! array_key_exists('actor_user_id', $metadata)) {
            return null;
        }

        $value = $metadata['actor_user_id'];

        if (is_int($value) && $value > 0) {
            return $value;
        }

        if (is_string($value) && ctype_digit($value)) {
            return (int) $value;
        }

        return null;
    }

    /**
     * @param array<string, mixed> $metadata
     */
    private function resolveSourceChannel(array $metadata): string
    {
        $explicit = strtolower((string) ($metadata['source_channel'] ?? ''));

        if (in_array($explicit, ['mobile', 'web', 'system'], true)) {
            return $explicit;
        }

        $source = strtolower((string) ($metadata['source'] ?? ''));

        return match ($source) {
            'sync', 'mobile' => 'mobile',
            'api', 'web' => 'web',
            default => 'system',
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function baseVariables(Order $order): array
    {
        return [
            'brand_name' => config('app.name', 'Laundry'),
            'customer_name' => $order->customer?->name ?? 'Pelanggan',
            'customer_display_name' => $order->customer?->name ?? null,
            'to_phone' => $order->customer?->phone_normalized,
            'invoice_no' => $order->invoice_no,
            'order_code' => $order->order_code,
            'outlet_name' => $order->outlet?->name,
            'laundry_status' => $order->laundry_status,
            'courier_status' => $order->courier_status,
            'is_pickup_delivery' => $order->is_pickup_delivery,
            'total_amount' => number_format((float) $order->total_amount, 0, ',', '.'),
            'total_amount_numeric' => (int) $order->total_amount,
            'due_amount' => number_format((float) $order->due_amount, 0, ',', '.'),
            'due_amount_numeric' => (int) $order->due_amount,
            'courier_name' => $order->courier?->name,
            'courier_phone' => $order->courier?->phone,
        ];
    }
}
