import { httpClient } from "../../lib/httpClient";
import type { WaMessageSummary, WaProvider } from "../../types/wa";

interface WaProvidersResponse {
  data: WaProvider[];
}

interface WaMessagesResponse {
  data: WaMessageSummary[];
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
