function randomHexDigit(): string {
  return Math.floor(Math.random() * 16).toString(16);
}

function fallbackUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createUuid(): string {
  const nativeRandomUuid = globalThis.crypto?.randomUUID;
  if (typeof nativeRandomUuid === "function") {
    return nativeRandomUuid.call(globalThis.crypto);
  }

  if (globalThis.crypto?.getRandomValues) {
    const buffer = new Uint8Array(16);
    globalThis.crypto.getRandomValues(buffer);
    buffer[6] = (buffer[6] & 0x0f) | 0x40;
    buffer[8] = (buffer[8] & 0x3f) | 0x80;

    const hex = Array.from(buffer, (item) => item.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return fallbackUuid();
}

export function createShortOrderCode(): string {
  const chunk = Array.from({ length: 8 }, () => randomHexDigit()).join("").toUpperCase();
  return `ORD-${chunk}`;
}
