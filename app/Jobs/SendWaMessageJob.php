<?php

namespace App\Jobs;

use App\Domain\Messaging\WaProviderException;
use App\Domain\Messaging\WaProviderRegistry;
use App\Models\WaMessage;
use App\Models\WaProviderConfig;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendWaMessageJob implements ShouldQueue
{
    use Queueable;

    private const MAX_ATTEMPTS = 5;

    public function __construct(
        public readonly string $waMessageId,
    ) {
    }

    public function handle(WaProviderRegistry $providerRegistry): void
    {
        /** @var WaMessage|null $message */
        $message = WaMessage::query()->find($this->waMessageId);

        if (! $message || in_array($message->status, ['sent', 'delivered'], true)) {
            return;
        }

        $attempt = (int) $message->attempts + 1;

        $configQuery = WaProviderConfig::query()
            ->with('provider:id,key')
            ->where('tenant_id', $message->tenant_id)
            ->where('is_active', true);

        if ($message->provider_id) {
            $configQuery->where('provider_id', $message->provider_id);
        }

        $providerConfig = $configQuery->first();

        if (! $providerConfig || ! $providerConfig->provider) {
            $message->forceFill([
                'status' => 'failed',
                'attempts' => $attempt,
                'last_error_code' => 'PROVIDER_CONFIG_MISSING',
                'last_error_message' => 'No active WhatsApp provider configuration found.',
                'updated_by' => null,
                'source_channel' => 'system',
            ])->save();

            return;
        }

        try {
            $driver = $providerRegistry->driverForKey($providerConfig->provider->key);

            $result = $driver->sendText(
                toPhone: (string) $message->to_phone,
                text: (string) $message->body_text,
                credentials: (array) ($providerConfig->credentials_json ?? []),
                metadata: (array) ($message->metadata_json ?? []),
            );

            $message->forceFill([
                'provider_id' => $providerConfig->provider_id,
                'status' => 'sent',
                'attempts' => $attempt,
                'provider_message_id' => $result['provider_message_id'] ?? null,
                'last_error_code' => null,
                'last_error_message' => null,
                'updated_by' => null,
                'source_channel' => 'system',
            ])->save();
        } catch (WaProviderException $e) {
            $shouldRetry = $e->transient && $attempt < self::MAX_ATTEMPTS;

            $message->forceFill([
                'provider_id' => $providerConfig->provider_id,
                'status' => $shouldRetry ? 'queued' : 'failed',
                'attempts' => $attempt,
                'last_error_code' => $e->reasonCode,
                'last_error_message' => $e->getMessage(),
                'updated_by' => null,
                'source_channel' => 'system',
            ])->save();

            if ($shouldRetry) {
                self::dispatch($message->id)
                    ->onQueue('messaging')
                    ->delay(now()->addSeconds($this->retryBackoffSeconds($attempt)));
            }
        } catch (\Throwable $e) {
            $shouldRetry = $attempt < self::MAX_ATTEMPTS;

            $message->forceFill([
                'provider_id' => $providerConfig->provider_id,
                'status' => $shouldRetry ? 'queued' : 'failed',
                'attempts' => $attempt,
                'last_error_code' => 'UNKNOWN_ERROR',
                'last_error_message' => $e->getMessage(),
                'updated_by' => null,
                'source_channel' => 'system',
            ])->save();

            if ($shouldRetry) {
                self::dispatch($message->id)
                    ->onQueue('messaging')
                    ->delay(now()->addSeconds($this->retryBackoffSeconds($attempt)));
            }
        }
    }

    private function retryBackoffSeconds(int $attempt): int
    {
        return match ($attempt) {
            1 => 30,
            2 => 60,
            3 => 120,
            4 => 240,
            default => 300,
        };
    }
}
