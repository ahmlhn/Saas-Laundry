import { httpClient } from "../../lib/httpClient";
import type { AppNotificationItem, AppNotificationListPayload } from "../../types/notification";

interface NotificationListResponse {
  data: AppNotificationItem[];
  meta?: {
    unread_count?: number;
  };
}

interface NotificationDetailResponse {
  data: AppNotificationItem;
}

interface DevicePushTokenResponse {
  data: {
    device_id: string;
    push_enabled: boolean;
    push_permission_status: string | null;
    has_push_token: boolean;
  };
}

export async function listNotifications(params: { limit?: number; unreadOnly?: boolean } = {}): Promise<AppNotificationListPayload> {
  const response = await httpClient.get<NotificationListResponse>("/notifications", {
    params: {
      limit: params.limit ?? 30,
      unread_only: params.unreadOnly === true ? 1 : undefined,
    },
  });

  return {
    data: response.data.data ?? [],
    unread_count: Math.max(Number(response.data.meta?.unread_count ?? 0), 0),
  };
}

export async function markNotificationRead(notificationId: string): Promise<AppNotificationItem> {
  const response = await httpClient.post<NotificationDetailResponse>(`/notifications/${notificationId}/read`);
  return response.data.data;
}

export async function markAllNotificationsRead(): Promise<void> {
  await httpClient.post("/notifications/read-all");
}

export async function upsertDevicePushToken(input: {
  deviceId: string;
  pushToken?: string | null;
  platform?: string | null;
  permissionStatus?: string | null;
  enabled?: boolean;
}): Promise<DevicePushTokenResponse["data"]> {
  const response = await httpClient.post<DevicePushTokenResponse>("/devices/push-token", {
    device_id: input.deviceId,
    provider: input.pushToken ? "expo" : null,
    push_token: input.pushToken ?? null,
    platform: input.platform ?? null,
    permission_status: input.permissionStatus ?? null,
    enabled: input.enabled ?? Boolean(input.pushToken),
  });

  return response.data.data;
}
