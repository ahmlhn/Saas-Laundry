import { useEffect, useRef } from "react";
import { useConnectivity } from "../connectivity/ConnectivityContext";
import { useSession } from "../../state/SessionContext";
import { navigateFromPushPayload } from "./notificationNavigation";
import { getAvailableNotificationsModule, registerDeviceForPushNotificationsAsync } from "./pushNotificationService";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function PushNotificationBootstrap() {
  const { booting, session } = useSession();
  const { hasResolvedState, isOnline } = useConnectivity();
  const registrationKeyRef = useRef<string | null>(null);
  const handledNotificationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const Notifications = getAvailableNotificationsModule();
    if (!Notifications) {
      return;
    }

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handledNotificationIdRef.current = response.notification.request.identifier;

      const data = isRecord(response.notification.request.content.data) ? response.notification.request.content.data : {};
      navigateFromPushPayload(data);
      if (typeof Notifications.clearLastNotificationResponseAsync === "function") {
        void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (booting || !session) {
      return;
    }

    const Notifications = getAvailableNotificationsModule();
    if (!Notifications || typeof Notifications.getLastNotificationResponseAsync !== "function") {
      return;
    }

    let cancelled = false;

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) {
          return;
        }

        const identifier = response.notification.request.identifier;
        if (handledNotificationIdRef.current === identifier) {
          return;
        }

        handledNotificationIdRef.current = identifier;
        const data = isRecord(response.notification.request.content.data) ? response.notification.request.content.data : {};
        navigateFromPushPayload(data);
        if (typeof Notifications.clearLastNotificationResponseAsync === "function") {
          return Notifications.clearLastNotificationResponseAsync();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [booting, session]);

  useEffect(() => {
    if (booting || !session || session.workspace !== "tenant") {
      registrationKeyRef.current = null;
      return;
    }

    if (!hasResolvedState || !isOnline) {
      registrationKeyRef.current = null;
      return;
    }

    const registrationKey = `${session.user.id}:${session.user.tenant_id ?? "tenant"}`;
    if (registrationKeyRef.current === registrationKey) {
      return;
    }

    registrationKeyRef.current = registrationKey;
    let active = true;

    void registerDeviceForPushNotificationsAsync().catch((error) => {
      console.warn("[PushNotifications] Registrasi token gagal.", error);
      if (active) {
        registrationKeyRef.current = null;
      }
    });

    return () => {
      active = false;
    };
  }, [booting, hasResolvedState, isOnline, session]);

  return null;
}
