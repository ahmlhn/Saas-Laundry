<?php

namespace App\Domain\Notifications;

use App\Models\Device;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ExpoPushService
{
    private const MAX_BATCH_SIZE = 100;

    /**
     * @param iterable<User> $users
     * @param array<string, mixed> $payload
     */
    public function sendToUsers(iterable $users, array $payload): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $userIds = [];
        foreach ($users as $user) {
            if ($user instanceof User) {
                $userIds[] = (int) $user->id;
            }
        }

        $userIds = array_values(array_unique(array_filter($userIds)));

        if ($userIds === []) {
            return;
        }

        $tenantId = trim((string) ($payload['tenant_id'] ?? ''));

        $query = Device::query()
            ->whereIn('user_id', $userIds)
            ->where('push_enabled', true)
            ->where('push_provider', 'expo')
            ->whereNotNull('push_token');

        if ($tenantId !== '') {
            $query->where('tenant_id', $tenantId);
        }

        $devices = $query->get(['id', 'user_id', 'push_token', 'push_platform']);
        if ($devices->isEmpty()) {
            return;
        }

        $headers = [
            'Accept' => 'application/json',
            'Accept-encoding' => 'gzip, deflate',
            'Content-Type' => 'application/json',
        ];

        $accessToken = trim((string) config('services.expo_push.access_token', ''));
        if ($accessToken !== '') {
            $headers['Authorization'] = 'Bearer '.$accessToken;
        }

        $messages = [];
        foreach ($devices as $device) {
            $token = trim((string) $device->push_token);
            if ($token === '') {
                continue;
            }

            $messages[] = $this->buildMessage($token, (string) ($device->push_platform ?? ''), $payload);
        }

        if ($messages === []) {
            return;
        }

        foreach (array_chunk($messages, self::MAX_BATCH_SIZE) as $batch) {
            try {
                $response = Http::timeout((int) config('services.expo_push.timeout_seconds', 10))
                    ->withHeaders($headers)
                    ->post((string) config('services.expo_push.endpoint', 'https://exp.host/--/api/v2/push/send'), $batch);

                if ($response->failed()) {
                    Log::warning('expo_push_request_failed', [
                        'status' => $response->status(),
                        'body' => $response->json(),
                    ]);

                    continue;
                }

                $tickets = $response->json('data');
                if (! is_array($tickets)) {
                    continue;
                }

                foreach ($tickets as $ticket) {
                    if (! is_array($ticket) || ($ticket['status'] ?? null) !== 'error') {
                        continue;
                    }

                    Log::warning('expo_push_ticket_error', [
                        'details' => $ticket,
                    ]);
                }
            } catch (\Throwable $exception) {
                report($exception);
            }
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function buildMessage(string $token, string $platform, array $payload): array
    {
        $message = [
            'to' => $token,
            'title' => (string) ($payload['title'] ?? ''),
            'body' => (string) ($payload['body'] ?? ''),
            'data' => $this->buildDataPayload($payload),
            'sound' => 'default',
            'priority' => $this->resolvePriority((string) ($payload['priority'] ?? 'normal')),
        ];

        if ($platform === 'android') {
            $message['channelId'] = 'default';
        }

        return $message;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function buildDataPayload(array $payload): array
    {
        $actionPayload = $payload['action_payload'] ?? [];
        if (! is_array($actionPayload)) {
            $actionPayload = [];
        }

        return array_filter([
            'notification_type' => $payload['type'] ?? null,
            'action_type' => $payload['action_type'] ?? null,
            'action_payload' => $actionPayload,
            'tenant_id' => $payload['tenant_id'] ?? null,
            'outlet_id' => $payload['outlet_id'] ?? null,
        ], static fn ($value): bool => $value !== null);
    }

    private function isEnabled(): bool
    {
        return (bool) config('services.expo_push.enabled', true);
    }

    private function resolvePriority(string $priority): string
    {
        return in_array($priority, ['high', 'urgent'], true) ? 'high' : 'default';
    }
}
