import { getAppMetaString, removeAppMeta, setAppMetaString } from "../localdb/appMetaStorage";
import type { UserContext } from "../../types/auth";

const SESSION_SNAPSHOT_KEY = "session.snapshot";
const SESSION_SNAPSHOT_VERSION = 1;

interface SessionSnapshotPayload {
  version: number;
  savedAt: string;
  session: UserContext;
}

function isUserContext(value: unknown): value is UserContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.user === "object" &&
    Array.isArray(record.roles) &&
    Array.isArray(record.allowed_outlets) &&
    typeof record.workspace === "string" &&
    typeof record.plan === "object" &&
    typeof record.quota === "object" &&
    typeof record.subscription === "object"
  );
}

export async function readSessionSnapshot(): Promise<UserContext | null> {
  const raw = await getAppMetaString(SESSION_SNAPSHOT_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionSnapshotPayload>;
    if (parsed.version !== SESSION_SNAPSHOT_VERSION || !isUserContext(parsed.session)) {
      return null;
    }

    return parsed.session;
  } catch {
    return null;
  }
}

export async function writeSessionSnapshot(session: UserContext): Promise<void> {
  const payload: SessionSnapshotPayload = {
    version: SESSION_SNAPSHOT_VERSION,
    savedAt: new Date().toISOString(),
    session,
  };

  await setAppMetaString(SESSION_SNAPSHOT_KEY, JSON.stringify(payload));
}

export async function clearSessionSnapshot(): Promise<void> {
  await removeAppMeta(SESSION_SNAPSHOT_KEY);
}
