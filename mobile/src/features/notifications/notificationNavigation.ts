import { navigationRef } from "../../navigation/navigationRef";
import type { AppNotificationAction } from "../../types/notification";

let pendingNavigationAction: (() => void) | null = null;

function normalizePayload(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function runWhenNavigationReady(action: () => void): void {
  if (!navigationRef.isReady()) {
    pendingNavigationAction = action;
    return;
  }

  pendingNavigationAction = null;
  action();
}

export function flushPendingNotificationNavigation(): void {
  if (!navigationRef.isReady() || !pendingNavigationAction) {
    return;
  }

  const action = pendingNavigationAction;
  pendingNavigationAction = null;
  action();
}

export function openNotificationInbox(): void {
  runWhenNavigationReady(() => {
    navigationRef.navigate("MainTabs", {
      screen: "AccountTab",
      params: {
        screen: "Notifications",
      },
    });
  });
}

export function navigateFromNotificationAction(action: AppNotificationAction | null | undefined): void {
  const type = typeof action?.type === "string" ? action.type : "";
  const payload = normalizePayload(action?.payload);

  if (type === "open_order_detail") {
    const orderId = typeof payload.order_id === "string" ? payload.order_id : null;
    if (orderId) {
      runWhenNavigationReady(() => {
        navigationRef.navigate("MainTabs", {
          screen: "OrdersTab",
          params: {
            screen: "OrderDetail",
            params: {
              orderId,
              returnToOrders: true,
            },
          },
        });
      });
      return;
    }
  }

  if (type === "open_subscription_center") {
    runWhenNavigationReady(() => {
      navigationRef.navigate("MainTabs", {
        screen: "AccountTab",
        params: {
          screen: "SubscriptionCenter",
        },
      });
    });
    return;
  }

  openNotificationInbox();
}

export function navigateFromPushPayload(payload: Record<string, unknown>): void {
  const actionType = typeof payload.action_type === "string" ? payload.action_type : "";
  const actionPayload = normalizePayload(payload.action_payload);

  if (!actionType) {
    openNotificationInbox();
    return;
  }

  navigateFromNotificationAction({
    type: actionType,
    payload: actionPayload,
  });
}
