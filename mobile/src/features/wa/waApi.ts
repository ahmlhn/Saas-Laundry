import { httpClient } from "../../lib/httpClient";
import type { WaMessageSummary, WaProvider } from "../../types/wa";

interface WaProvidersResponse {
  data: WaProvider[];
}

interface WaMessagesResponse {
  data: WaMessageSummary[];
}

interface UpsertWaProviderConfigResponse {
  data: {
    id: string;
    provider_id: string;
    provider_key: string;
    is_active: boolean;
    credentials_set: boolean;
    health?: {
      ok?: boolean;
      message?: string;
    };
  };
}

interface UpsertWaProviderConfigPayload {
  providerKey: string;
  credentials?: Record<string, unknown>;
  isActive?: boolean;
}

export async function listWaProviders(): Promise<WaProvider[]> {
  const response = await httpClient.get<WaProvidersResponse>("/wa/providers");
  return response.data.data;
}

export async function listWaMessages(limit = 20): Promise<WaMessageSummary[]> {
  const response = await httpClient.get<WaMessagesResponse>("/wa/messages", {
    params: {
      limit,
    },
  });

  return response.data.data;
}

export async function upsertWaProviderConfig(payload: UpsertWaProviderConfigPayload): Promise<{
  providerKey: string;
  isActive: boolean;
  credentialsSet: boolean;
  healthOk: boolean;
  healthMessage: string;
}> {
  const response = await httpClient.post<UpsertWaProviderConfigResponse>("/wa/provider-config", {
    provider_key: payload.providerKey,
    credentials: payload.credentials ?? {},
    is_active: payload.isActive ?? true,
  });

  return {
    providerKey: response.data.data.provider_key,
    isActive: response.data.data.is_active,
    credentialsSet: response.data.data.credentials_set,
    healthOk: response.data.data.health?.ok !== false,
    healthMessage: response.data.data.health?.message ?? "",
  };
}
