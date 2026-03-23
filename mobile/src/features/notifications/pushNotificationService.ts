import Constants from "expo-constants";
import { Platform } from "react-native";
import { EXPO_PROJECT_ID } from "../../config/env";
import { getOrCreateDeviceId } from "../sync/deviceIdentity";
import { upsertDevicePushToken } from "./notificationApi";

const ANDROID_CHANNEL_ID = "default";

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let notificationsModuleCache: NotificationsModule | null | undefined;
let deviceModuleCache: DeviceModule | null | undefined;
let notificationHandlerConfigured = false;
let notificationModuleWarningShown = false;
let deviceModuleWarningShown = false;

function getNotificationsModule(): NotificationsModule | null {
  if (notificationsModuleCache !== undefined) {
    return notificationsModuleCache;
  }

  try {
    notificationsModuleCache = require("expo-notifications") as NotificationsModule;
  } catch (error) {
    notificationsModuleCache = null;
    if (!notificationModuleWarningShown) {
      notificationModuleWarningShown = true;
      console.warn("[PushNotifications] Native module expo-notifications belum tersedia di build ini.", error);
    }
  }

  return notificationsModuleCache;
}

function getDeviceModule(): DeviceModule | null {
  if (deviceModuleCache !== undefined) {
    return deviceModuleCache;
  }

  try {
    deviceModuleCache = require("expo-device") as DeviceModule;
  } catch (error) {
    deviceModuleCache = null;
    if (!deviceModuleWarningShown) {
      deviceModuleWarningShown = true;
      console.warn("[PushNotifications] Native module expo-device belum tersedia di build ini.", error);
    }
  }

  return deviceModuleCache;
}

function ensureNotificationHandlerConfigured(): NotificationsModule | null {
  const Notifications = getNotificationsModule();
  if (!Notifications || notificationHandlerConfigured) {
    return Notifications;
  }

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    notificationHandlerConfigured = true;
  } catch (error) {
    console.warn("[PushNotifications] Gagal menyiapkan notification handler.", error);
    notificationsModuleCache = null;
    return null;
  }

  return Notifications;
}

export function getAvailableNotificationsModule(): NotificationsModule | null {
  return ensureNotificationHandlerConfigured();
}

function resolveProjectId(): string {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig.trim();
  }

  return EXPO_PROJECT_ID;
}

function normalizePermissionStatus(status: string | null | undefined): string | null {
  return typeof status === "string" && status.trim().length > 0 ? status.trim() : null;
}

async function ensureAndroidChannelAsync(): Promise<void> {
  const Notifications = ensureNotificationHandlerConfigured();
  if (!Notifications || Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#14b8a6",
  });
}

export async function registerDeviceForPushNotificationsAsync(): Promise<string | null> {
  const deviceId = await getOrCreateDeviceId();
  const Notifications = ensureNotificationHandlerConfigured();
  const Device = getDeviceModule();

  if (!Notifications || !Device) {
    return null;
  }

  await ensureAndroidChannelAsync();

  if (!Device.isDevice) {
    await upsertDevicePushToken({
      deviceId,
      pushToken: null,
      platform: Platform.OS,
      permissionStatus: "device_unsupported",
      enabled: false,
    });
    return null;
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (finalStatus !== "granted") {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  const permissionStatus = normalizePermissionStatus(finalStatus);
  if (finalStatus !== "granted") {
    await upsertDevicePushToken({
      deviceId,
      pushToken: null,
      platform: Platform.OS,
      permissionStatus,
      enabled: false,
    });
    return null;
  }

  const projectId = resolveProjectId();
  if (projectId.length === 0) {
    console.warn("[PushNotifications] Expo projectId belum tersedia. Set EXPO_PUBLIC_EXPO_PROJECT_ID atau gunakan build dengan EAS config.");
    return null;
  }

  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await upsertDevicePushToken({
    deviceId,
    pushToken,
    platform: Platform.OS,
    permissionStatus,
    enabled: true,
  });

  return pushToken;
}

export async function unregisterDevicePushTokenAsync(): Promise<void> {
  const deviceId = await getOrCreateDeviceId();

  await upsertDevicePushToken({
    deviceId,
    pushToken: null,
    platform: Platform.OS,
    permissionStatus: "disabled",
    enabled: false,
  });
}
