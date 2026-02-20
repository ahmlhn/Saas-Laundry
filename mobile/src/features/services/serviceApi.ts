import { httpClient } from "../../lib/httpClient";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { ServiceCatalogItem } from "../../types/service";

interface ServicesResponse {
  data: ServiceCatalogItem[];
}

interface ServiceResponse {
  data: ServiceCatalogItem;
}

interface ServiceArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

interface ListServicesParams {
  outletId?: string;
  includeDeleted?: boolean;
  active?: boolean;
  forceRefresh?: boolean;
}

export async function listServices(params: ListServicesParams = {}): Promise<ServiceCatalogItem[]> {
  const outletId = params.outletId ?? "all";
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const active = typeof params.active === "boolean" ? (params.active ? "1" : "0") : "all";
  const cacheKey = `services:list:${outletId}:${includeDeleted}:${active}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<ServiceCatalogItem[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<ServicesResponse>("/services", {
    params: {
      outlet_id: params.outletId || undefined,
      include_deleted: params.includeDeleted || undefined,
      active: typeof params.active === "boolean" ? params.active : undefined,
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function archiveService(serviceId: string): Promise<string | null> {
  const response = await httpClient.delete<ServiceArchiveResponse>(`/services/${serviceId}`);
  invalidateCache("services:list:");
  return response.data.data.deleted_at;
}

export async function restoreService(serviceId: string): Promise<ServiceCatalogItem> {
  const response = await httpClient.post<ServiceResponse>(`/services/${serviceId}/restore`);
  invalidateCache("services:list:");
  return response.data.data;
}
