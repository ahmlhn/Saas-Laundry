import { httpClient } from "../../lib/httpClient";
import type { TenantProfile } from "../../types/tenant";

interface TenantProfileResponse {
  data: TenantProfile;
}

export interface TenantUpdatePayload {
  name: string;
  status?: "active" | "inactive";
}

export async function getTenantProfile(): Promise<TenantProfile> {
  const response = await httpClient.get<TenantProfileResponse>("/tenant-management");
  return response.data.data;
}

export async function updateTenantProfile(payload: TenantUpdatePayload): Promise<TenantProfile> {
  const response = await httpClient.patch<TenantProfileResponse>("/tenant-management", payload);
  return response.data.data;
}
