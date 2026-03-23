export const LOCAL_GLOBAL_SCOPE = "__global__";

export function nowIsoString(): string {
  return new Date().toISOString();
}

export function normalizeSearchText(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => {
      if (typeof part === "number") {
        return String(part);
      }

      if (typeof part === "string") {
        return part.trim().toLowerCase();
      }

      return "";
    })
    .filter((part) => part.length > 0)
    .join(" ");
}

export function toDbBoolean(value: boolean | null | undefined): number | null {
  if (typeof value !== "boolean") {
    return null;
  }

  return value ? 1 : 0;
}

export function fromDbBoolean(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function resolveServiceContextOutletId(outletId?: string): string {
  const trimmed = outletId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : LOCAL_GLOBAL_SCOPE;
}

export function normalizeNumericText(value: string | number | null | undefined): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}
