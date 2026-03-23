import { readStoredDeviceId, writeStoredDeviceId } from "./syncStateStorage";

function createPseudoUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  const stored = await readStoredDeviceId();
  if (stored) {
    return stored;
  }

  const generated =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : createPseudoUuid();

  await writeStoredDeviceId(generated);
  return generated;
}
