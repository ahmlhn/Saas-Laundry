<?php

namespace App\Domain\Subscription;

use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPaymentEvent;
use App\Models\SubscriptionPaymentIntent;
use App\Models\Tenant;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class SubscriptionPaymentGatewayService
{
    public function __construct(
        private readonly BriQrisGatewayClient $briQrisGatewayClient,
    ) {
    }

    public function createQrisIntent(
        SubscriptionInvoice $invoice,
        ?User $actor = null,
        bool $forceNew = false,
    ): SubscriptionPaymentIntent {
        if ($invoice->payment_method !== 'bri_qris') {
            throw new RuntimeException('QRIS intent only applies to bri_qris invoices.');
        }

        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            throw new RuntimeException('Invoice status does not allow new payment intent.');
        }

        if (! $forceNew) {
            $existing = SubscriptionPaymentIntent::query()
                ->where('invoice_id', $invoice->id)
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

        $expiresAt = $this->resolveIntentExpiry($invoice);
        $reference = $this->generateIntentReference($invoice);
        $gatewayIntent = $this->briQrisGatewayClient->createDynamicQris($invoice, $reference, $expiresAt);

        return DB::transaction(function () use ($invoice, $actor, $gatewayIntent): SubscriptionPaymentIntent {
            $intent = SubscriptionPaymentIntent::query()->create([
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'provider' => 'bri_qris',
                'intent_reference' => (string) $gatewayIntent['reference'],
                'amount_total' => (int) $invoice->amount_total,
                'currency' => (string) ($invoice->currency ?: 'IDR'),
                'status' => 'ready',
                'qris_payload' => (string) $gatewayIntent['qris_payload'],
                'expires_at' => $gatewayIntent['expires_at'],
                'requested_by' => $actor?->id,
                'gateway_response_json' => $gatewayIntent['response'],
            ]);

            $invoice->forceFill([
                'gateway_provider' => 'bri_qris',
                'gateway_reference' => $intent->intent_reference,
                'qris_payload' => $intent->qris_payload,
                'qris_expired_at' => $intent->expires_at,
                'gateway_status' => 'intent_created',
                'gateway_updated_at' => now(),
            ])->save();

            return $intent;
        });
    }

    /**
     * @return array{
     *     event: SubscriptionPaymentEvent,
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

        $existingEvent = SubscriptionPaymentEvent::query()
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
        $event = SubscriptionPaymentEvent::query()->create([
            'provider' => 'bri_qris',
            'gateway_event_id' => $eventId,
            'event_type' => $normalized['event_type'],
            'event_status' => $normalized['event_status'],
            'amount_total' => $normalized['amount_total'],
            'currency' => $normalized['currency'],
            'gateway_reference' => $normalized['gateway_reference'],
            'signature_valid' => $signatureValid,
            'process_status' => 'received',
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

        $invoice = $this->resolveInvoiceFromWebhook($normalized);
        if (! $invoice) {
            $this->markEventProcessed($event, 'unmatched_invoice', 'invoice_not_found');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        $event->forceFill([
            'invoice_id' => $invoice->id,
            'tenant_id' => $invoice->tenant_id,
        ])->save();

        if ($invoice->payment_method !== 'bri_qris') {
            $invoice->forceFill([
                'gateway_status' => 'ignored_payment_method',
                'gateway_updated_at' => now(),
            ])->save();

            $this->markEventProcessed($event, 'ignored_payment_method', 'invoice_not_bri_qris');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        if (! $normalized['is_success']) {
            $invoice->forceFill([
                'gateway_status' => 'awaiting_payment',
                'gateway_reference' => $normalized['gateway_reference'] ?: $invoice->gateway_reference,
                'gateway_updated_at' => now(),
            ])->save();

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

        if ((int) $invoice->amount_total !== $amountTotal) {
            $invoice->forceFill([
                'gateway_status' => 'amount_mismatch',
                'gateway_reference' => $normalized['gateway_reference'] ?: $invoice->gateway_reference,
                'gateway_updated_at' => now(),
            ])->save();

            $this->markEventProcessed($event, 'amount_mismatch', 'amount_mismatch');

            return [
                'event' => $event->fresh(),
                'duplicate' => false,
            ];
        }

        DB::transaction(function () use ($event, $invoice, $normalized, $amountTotal): void {
            $lockedInvoice = SubscriptionInvoice::query()
                ->whereKey($invoice->id)
                ->lockForUpdate()
                ->first();

            if (! $lockedInvoice) {
                $this->markEventProcessed($event, 'unmatched_invoice', 'invoice_not_found_after_lock');
                return;
            }

            $processStatus = 'accepted';

            if ($lockedInvoice->status === 'paid') {
                $processStatus = 'duplicate';
            } else {
                $lockedInvoice->forceFill([
                    'status' => 'paid',
                    'paid_verified_at' => now(),
                    'verified_by' => null,
                    'updated_by' => null,
                ])->save();
            }

            $lockedInvoice->forceFill([
                'gateway_provider' => 'bri_qris',
                'gateway_status' => 'paid',
                'gateway_reference' => $normalized['gateway_reference'] ?: $lockedInvoice->gateway_reference,
                'gateway_paid_amount' => $amountTotal,
                'gateway_updated_at' => now(),
            ])->save();

            $tenant = Tenant::query()
                ->whereKey($lockedInvoice->tenant_id)
                ->lockForUpdate()
                ->first();

            if ($tenant) {
                $tenant->forceFill([
                    'subscription_state' => 'active',
                    'write_access_mode' => 'full',
                ])->save();
            }

            $event->forceFill([
                'invoice_id' => $lockedInvoice->id,
                'tenant_id' => $lockedInvoice->tenant_id,
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

    /**
     * @return array{scanned: int, updated: int, mismatch: int}
     */
    public function reconcileGatewayPayments(?string $tenantId = null, bool $dryRun = false): array
    {
        $query = SubscriptionInvoice::query()
            ->where('payment_method', 'bri_qris')
            ->whereIn('status', ['issued', 'pending_verification', 'overdue'])
            ->orderBy('due_at');

        if ($tenantId !== null && $tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        $invoices = $query->get();
        $updated = 0;
        $mismatch = 0;

        foreach ($invoices as $invoice) {
            $latestSuccessfulEvent = SubscriptionPaymentEvent::query()
                ->where('invoice_id', $invoice->id)
                ->where('signature_valid', true)
                ->whereIn('process_status', ['accepted', 'duplicate'])
                ->latest('received_at')
                ->first();

            if (! $latestSuccessfulEvent) {
                continue;
            }

            if ((int) $latestSuccessfulEvent->amount_total !== (int) $invoice->amount_total) {
                $mismatch++;
                continue;
            }

            if ($dryRun) {
                $updated++;
                continue;
            }

            DB::transaction(function () use ($invoice, $latestSuccessfulEvent): void {
                $lockedInvoice = SubscriptionInvoice::query()
                    ->whereKey($invoice->id)
                    ->lockForUpdate()
                    ->first();

                if (! $lockedInvoice) {
                    return;
                }

                if ($lockedInvoice->status !== 'paid') {
                    $lockedInvoice->forceFill([
                        'status' => 'paid',
                        'paid_verified_at' => now(),
                        'verified_by' => null,
                        'updated_by' => null,
                    ])->save();
                }

                $lockedInvoice->forceFill([
                    'gateway_provider' => 'bri_qris',
                    'gateway_status' => 'paid',
                    'gateway_reference' => $latestSuccessfulEvent->gateway_reference ?: $lockedInvoice->gateway_reference,
                    'gateway_paid_amount' => (int) $latestSuccessfulEvent->amount_total,
                    'gateway_updated_at' => now(),
                ])->save();

                Tenant::query()
                    ->whereKey($lockedInvoice->tenant_id)
                    ->update([
                        'subscription_state' => 'active',
                        'write_access_mode' => 'full',
                    ]);
            });

            $updated++;
        }

        return [
            'scanned' => $invoices->count(),
            'updated' => $updated,
            'mismatch' => $mismatch,
        ];
    }

    private function resolveIntentExpiry(SubscriptionInvoice $invoice): CarbonInterface
    {
        $ttlMinutes = max((int) config('subscription.gateway_intent_ttl_minutes', 1440), 15);
        $expiresAt = now()->addMinutes($ttlMinutes);

        if ($invoice->due_at && $invoice->due_at->lt($expiresAt)) {
            $expiresAt = $invoice->due_at->copy();
        }

        if ($expiresAt->lte(now())) {
            $expiresAt = now()->addMinutes(15);
        }

        return $expiresAt;
    }

    private function generateIntentReference(SubscriptionInvoice $invoice): string
    {
        return sprintf(
            'BRI-%s-%s',
            Str::upper(Str::slug($invoice->invoice_no, '')),
            strtoupper(Str::random(8))
        );
    }

    private function markEventProcessed(
        SubscriptionPaymentEvent $event,
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
     *     invoice_id: string,
     *     invoice_no: string,
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
            'invoice_id' => $this->extractString($payload, ['invoice_id', 'data.invoice_id', 'metadata.invoice_id']) ?: '',
            'invoice_no' => $this->extractString($payload, ['invoice_no', 'order_id', 'merchant_trx_id', 'data.invoice_no']) ?: '',
            'amount_total' => $this->extractInt($payload, ['amount_total', 'amount', 'paid_amount', 'data.amount']),
            'currency' => strtoupper($this->extractString($payload, ['currency', 'data.currency']) ?: 'IDR'),
            'gateway_reference' => $this->extractString($payload, ['gateway_reference', 'reference', 'rrn', 'trx_id', 'transaction_id', 'data.reference']) ?: '',
            'is_success' => $isSuccess,
        ];
    }

    /**
     * @param array<string, mixed> $normalized
     */
    private function resolveInvoiceFromWebhook(array $normalized): ?SubscriptionInvoice
    {
        $invoiceId = trim((string) ($normalized['invoice_id'] ?? ''));
        if ($invoiceId !== '') {
            $invoice = SubscriptionInvoice::query()->whereKey($invoiceId)->first();
            if ($invoice) {
                return $invoice;
            }
        }

        $invoiceNo = trim((string) ($normalized['invoice_no'] ?? ''));
        if ($invoiceNo !== '') {
            return SubscriptionInvoice::query()
                ->where('invoice_no', $invoiceNo)
                ->first();
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
