export interface AppNotificationOutlet {
  id: string;
  name: string;
  code: string;
}

export interface AppNotificationAction {
  type: string;
  payload: Record<string, unknown>;
}

export interface AppNotificationItem {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string | null;
  outlet: AppNotificationOutlet | null;
  action: AppNotificationAction | null;
}

export interface AppNotificationListPayload {
  data: AppNotificationItem[];
  unread_count: number;
}
