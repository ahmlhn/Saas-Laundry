import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { ServiceProcessTag } from "../../types/service";

interface TagListResponse {
  data: ServiceProcessTag[];
}

interface TagResponse {
  data: ServiceProcessTag;
}

interface TagArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

interface ListServiceProcessTagsParams {
  q?: string;
  includeDeleted?: boolean;
  forceRefresh?: boolean;
}

export async function listServiceProcessTags(params: ListServiceProcessTagsParams = {}): Promise<ServiceProcessTag[]> {
  const cacheKey = `service-tags:list:${params.includeDeleted ? "1" : "0"}:${params.q?.trim().toLowerCase() ?? ""}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<ServiceProcessTag[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<TagListResponse>("/service-process-tags", {
    params: {
      q: params.q?.trim() || undefined,
      include_deleted: toQueryBoolean(params.includeDeleted),
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function createServiceProcessTag(payload: {
  name: string;
  colorHex?: string;
  sortOrder?: number;
  active?: boolean;
}): Promise<ServiceProcessTag> {
  const response = await httpClient.post<TagResponse>("/service-process-tags", {
    name: payload.name,
    color_hex: payload.colorHex,
    sort_order: payload.sortOrder,
    active: payload.active,
  });

  invalidateCache("service-tags:list:");
  invalidateCache("services:list:");
  return response.data.data;
}

export async function updateServiceProcessTag(
  tagId: string,
  payload: {
    name?: string;
    colorHex?: string;
    sortOrder?: number;
    active?: boolean;
  }
): Promise<ServiceProcessTag> {
  const body: Record<string, unknown> = {};

  if (typeof payload.name === "string") {
    body.name = payload.name;
  }

  if (typeof payload.colorHex === "string") {
    body.color_hex = payload.colorHex;
  }

  if (typeof payload.sortOrder === "number") {
    body.sort_order = payload.sortOrder;
  }

  if (typeof payload.active === "boolean") {
    body.active = payload.active;
  }

  const response = await httpClient.patch<TagResponse>(`/service-process-tags/${tagId}`, body);
  invalidateCache("service-tags:list:");
  invalidateCache("services:list:");
  return response.data.data;
}

export async function archiveServiceProcessTag(tagId: string): Promise<string | null> {
  const response = await httpClient.delete<TagArchiveResponse>(`/service-process-tags/${tagId}`);
  invalidateCache("service-tags:list:");
  invalidateCache("services:list:");
  return response.data.data.deleted_at;
}
