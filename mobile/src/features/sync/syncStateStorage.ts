import { getAppMetaString, setAppMetaString } from "../localdb/appMetaStorage";

const DEVICE_ID_KEY = "sync.device_id";
const LAST_CURSOR_KEY = "sync.last_cursor";
const LAST_SUCCESSFUL_SYNC_AT_KEY = "sync.last_successful_sync_at";
const UNSYNCED_COUNT_KEY = "sync.unsynced_count";
const REJECTED_COUNT_KEY = "sync.rejected_count";

function buildSelectedOutletCursorKey(outletId: string): string {
  return `sync.last_cursor.selected_outlet.${outletId}`;
}

export interface SyncStateSnapshot {
  deviceId: string | null;
  lastCursor: string | null;
  lastSuccessfulSyncAt: string | null;
  unsyncedCount: number;
  rejectedCount: number;
}

export async function readStoredDeviceId(): Promise<string | null> {
  return getAppMetaString(DEVICE_ID_KEY);
}

export async function writeStoredDeviceId(deviceId: string): Promise<void> {
  await setAppMetaString(DEVICE_ID_KEY, deviceId);
}

export async function readLastKnownCursor(): Promise<string | null> {
  return getAppMetaString(LAST_CURSOR_KEY);
}

export async function writeLastKnownCursor(cursor: string | null): Promise<void> {
  await setAppMetaString(LAST_CURSOR_KEY, cursor ?? "");
}

export async function readLastKnownCursorForOutlet(outletId: string): Promise<string | null> {
  return getAppMetaString(buildSelectedOutletCursorKey(outletId));
}

export async function writeLastKnownCursorForOutlet(outletId: string, cursor: string | null): Promise<void> {
  await setAppMetaString(buildSelectedOutletCursorKey(outletId), cursor ?? "");
}

export async function readLastSuccessfulSyncAt(): Promise<string | null> {
  return getAppMetaString(LAST_SUCCESSFUL_SYNC_AT_KEY);
}

export async function writeLastSuccessfulSyncAt(value: string | null): Promise<void> {
  await setAppMetaString(LAST_SUCCESSFUL_SYNC_AT_KEY, value ?? "");
}

export async function readUnsyncedCount(): Promise<number> {
  const raw = await getAppMetaString(UNSYNCED_COUNT_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export async function writeUnsyncedCount(value: number): Promise<void> {
  const normalized = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  await setAppMetaString(UNSYNCED_COUNT_KEY, String(normalized));
}

export async function readRejectedCount(): Promise<number> {
  const raw = await getAppMetaString(REJECTED_COUNT_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export async function writeRejectedCount(value: number): Promise<void> {
  const normalized = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  await setAppMetaString(REJECTED_COUNT_KEY, String(normalized));
}

export async function ensureSyncStateInitialized(deviceId: string): Promise<void> {
  const [storedDeviceId, unsyncedCountRaw] = await Promise.all([
    readStoredDeviceId(),
    getAppMetaString(UNSYNCED_COUNT_KEY),
  ]);

  const tasks: Promise<void>[] = [];
  if (!storedDeviceId) {
    tasks.push(writeStoredDeviceId(deviceId));
  }
  if (unsyncedCountRaw === null) {
    tasks.push(writeUnsyncedCount(0));
  }
  if ((await getAppMetaString(REJECTED_COUNT_KEY)) === null) {
    tasks.push(writeRejectedCount(0));
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}

export async function readSyncStateSnapshot(): Promise<SyncStateSnapshot> {
  const [deviceId, lastCursor, lastSuccessfulSyncAt, unsyncedCount, rejectedCount] = await Promise.all([
    readStoredDeviceId(),
    readLastKnownCursor(),
    readLastSuccessfulSyncAt(),
    readUnsyncedCount(),
    readRejectedCount(),
  ]);

  return {
    deviceId,
    lastCursor: lastCursor || null,
    lastSuccessfulSyncAt: lastSuccessfulSyncAt || null,
    unsyncedCount,
    rejectedCount,
  };
}
