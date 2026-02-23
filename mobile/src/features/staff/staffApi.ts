import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { StaffMember } from "../../types/staff";

interface StaffListResponse {
  data: StaffMember[];
}

interface StaffResponse {
  data: StaffMember;
}

interface StaffArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

interface ListStaffParams {
  query?: string;
  limit?: number;
  includeDeleted?: boolean;
  forceRefresh?: boolean;
}

export async function listStaff(params: ListStaffParams = {}): Promise<StaffMember[]> {
  const query = params.query?.trim() || "";
  const limit = params.limit ?? 60;
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const cacheKey = `staff:list:${query}:${limit}:${includeDeleted}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<StaffMember[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<StaffListResponse>("/users", {
    params: {
      q: query || undefined,
      limit,
      include_deleted: toQueryBoolean(params.includeDeleted),
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function archiveStaff(staffId: string): Promise<string | null> {
  const response = await httpClient.delete<StaffArchiveResponse>(`/users/${staffId}`);
  invalidateCache("staff:list:");
  return response.data.data.deleted_at;
}

export async function restoreStaff(staffId: string): Promise<StaffMember> {
  const response = await httpClient.post<StaffResponse>(`/users/${staffId}/restore`);
  invalidateCache("staff:list:");
  return response.data.data;
}
