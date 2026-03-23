<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\EnsuresApiAccess;
use App\Http\Controllers\Controller;
use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    use EnsuresApiAccess;

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier', 'worker', 'courier']);

        $validated = $request->validate([
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'unread_only' => ['nullable', 'boolean'],
        ]);

        $limit = (int) ($validated['limit'] ?? 30);
        $unreadOnly = (bool) ($validated['unread_only'] ?? false);

        $query = AppNotification::query()
            ->with('outlet:id,name,code')
            ->where('user_id', $user->id)
            ->latest('created_at');

        if ($unreadOnly) {
            $query->whereNull('read_at');
        }

        $items = $query->limit($limit)->get();
        $unreadCount = AppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'data' => $items->map(fn (AppNotification $notification): array => $this->serializeNotification($notification))->values(),
            'meta' => [
                'unread_count' => $unreadCount,
            ],
        ]);
    }

    public function markRead(Request $request, string $notificationId): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier', 'worker', 'courier']);

        $notification = AppNotification::query()
            ->where('id', $notificationId)
            ->where('user_id', $user->id)
            ->first();

        if (! $notification) {
            return response()->json([
                'reason_code' => 'DATA_NOT_FOUND',
                'message' => 'Notification not found.',
            ], 404);
        }

        if (! $notification->read_at) {
            $notification->forceFill([
                'read_at' => now(),
            ])->save();
        }

        return response()->json([
            'data' => $this->serializeNotification($notification->fresh(['outlet:id,name,code']) ?? $notification),
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $this->ensureRole($user, ['owner', 'admin', 'cashier', 'worker', 'courier']);

        AppNotification::query()
            ->where('user_id', $user->id)
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'data' => [
                'ok' => true,
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeNotification(AppNotification $notification): array
    {
        return [
            'id' => (string) $notification->id,
            'type' => (string) $notification->type,
            'priority' => (string) $notification->priority,
            'title' => (string) $notification->title,
            'body' => (string) $notification->body,
            'read_at' => $notification->read_at?->toIso8601String(),
            'created_at' => $notification->created_at?->toIso8601String(),
            'outlet' => $notification->outlet ? [
                'id' => (string) $notification->outlet->id,
                'name' => (string) $notification->outlet->name,
                'code' => (string) $notification->outlet->code,
            ] : null,
            'action' => $notification->action_type ? [
                'type' => (string) $notification->action_type,
                'payload' => $notification->action_payload ?? [],
            ] : null,
        ];
    }
}
