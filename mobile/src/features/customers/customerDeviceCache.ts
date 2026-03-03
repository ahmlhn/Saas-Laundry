import * as FileSystem from "expo-file-system/legacy";
import type { Customer } from "../../types/customer";

const CACHE_VERSION = 1;
const CACHE_DIRECTORY_NAME = "customer-cache";

interface CustomerDeviceCachePayload {
  version: number;
  tenantId: string;
  savedAt: string;
  customers: Customer[];
}

function sanitizeTenantId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function resolveCacheDirectoryUri(): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }

  return `${FileSystem.documentDirectory}${CACHE_DIRECTORY_NAME}`;
}

function resolveCustomerCacheUri(tenantId: string): string | null {
  const directoryUri = resolveCacheDirectoryUri();
  if (!directoryUri) {
    return null;
  }

  return `${directoryUri}/customers-${sanitizeTenantId(tenantId)}.json`;
}

function isCustomerShape(value: unknown): value is Customer {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.tenant_id === "string" &&
    typeof record.name === "string" &&
    typeof record.phone_normalized === "string" &&
    typeof record.created_at === "string" &&
    typeof record.updated_at === "string"
  );
}

async function ensureCacheDirectory(): Promise<string | null> {
  const directoryUri = resolveCacheDirectoryUri();
  if (!directoryUri) {
    return null;
  }

  const info = await FileSystem.getInfoAsync(directoryUri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directoryUri, {
      intermediates: true,
    });
  }

  return directoryUri;
}

export async function readCustomerDeviceCache(tenantId: string): Promise<Customer[] | null> {
  const cacheUri = resolveCustomerCacheUri(tenantId);
  if (!cacheUri) {
    return null;
  }

  try {
    const info = await FileSystem.getInfoAsync(cacheUri);
    if (!info.exists) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(cacheUri);
    if (!raw.trim()) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<CustomerDeviceCachePayload>;
    if (
      parsed.version !== CACHE_VERSION ||
      parsed.tenantId !== tenantId ||
      !Array.isArray(parsed.customers)
    ) {
      return null;
    }

    return parsed.customers.filter(isCustomerShape);
  } catch {
    return null;
  }
}

export async function writeCustomerDeviceCache(tenantId: string, customers: Customer[]): Promise<void> {
  const directoryUri = await ensureCacheDirectory();
  if (!directoryUri) {
    return;
  }

  const cacheUri = `${directoryUri}/customers-${sanitizeTenantId(tenantId)}.json`;
  const payload: CustomerDeviceCachePayload = {
    version: CACHE_VERSION,
    tenantId,
    savedAt: new Date().toISOString(),
    customers,
  };

  try {
    await FileSystem.writeAsStringAsync(cacheUri, JSON.stringify(payload));
  } catch {
    // Ignore device cache write failures and keep network flow unaffected.
  }
}
