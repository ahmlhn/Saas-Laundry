import { getLocalDatabase } from "./database";

interface AppMetaRow {
  value: string | null;
}

export async function getAppMetaString(key: string): Promise<string | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<AppMetaRow>("SELECT value FROM app_meta WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setAppMetaString(key: string, value: string): Promise<void> {
  const db = await getLocalDatabase();
  const updatedAt = new Date().toISOString();
  await db.runAsync(
    `
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    key,
    value,
    updatedAt,
  );
}

export async function removeAppMeta(key: string): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync("DELETE FROM app_meta WHERE key = ?", key);
}
