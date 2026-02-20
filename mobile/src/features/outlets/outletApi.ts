import { httpClient } from "../../lib/httpClient";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { OutletItem } from "../../types/outlet";

interface OutletsResponse {
  data: OutletItem[];
}

interface OutletResponse {
  data: OutletItem;
}

interface OutletArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

interface ListOutletsParams {
  query?: string;
  limit?: number;
  includeDeleted?: boolean;
  forceRefresh?: boolean;
}

export async function listOutlets(params: ListOutletsParams = {}): Promise<OutletItem[]> {
  const query = params.query?.trim() || "";
  const limit = params.limit ?? 60;
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const cacheKey = `outlets:list:${query}:${limit}:${includeDeleted}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<OutletItem[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<OutletsResponse>("/outlets", {
    params: {
      q: query || undefined,
      limit,
      include_deleted: params.includeDeleted || undefined,
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function archiveOutlet(outletId: string): Promise<string | null> {
  const response = await httpClient.delete<OutletArchiveResponse>(`/outlets/${outletId}`);
  invalidateCache("outlets:list:");
  return response.data.data.deleted_at;
}

export async function restoreOutlet(outletId: string): Promise<OutletItem> {
  const response = await httpClient.post<OutletResponse>(`/outlets/${outletId}/restore`);
  invalidateCache("outlets:list:");
  return response.data.data;
}
