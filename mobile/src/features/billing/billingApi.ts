import { httpClient } from "../../lib/httpClient";
import type { BillingQuotaPayload } from "../../types/billing";

interface BillingQuotaResponse {
  data: BillingQuotaPayload;
}

interface BillingQuotaParams {
  period?: string;
}

export async function getBillingQuota(params: BillingQuotaParams = {}): Promise<BillingQuotaPayload> {
  const response = await httpClient.get<BillingQuotaResponse>("/billing/quota", {
    params: {
      period: params.period?.trim() || undefined,
    },
  });

  return response.data.data;
}
