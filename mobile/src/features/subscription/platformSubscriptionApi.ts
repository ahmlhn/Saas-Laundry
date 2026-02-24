import { httpClient } from "../../lib/httpClient";
import type {
  PlatformSubscriptionInvoiceVerifyResult,
  PlatformSubscriptionPaymentEvent,
  PlatformSubscriptionTenantDetailPayload,
  PlatformSubscriptionTenantListItem,
  PlatformSubscriptionTenantStateResult,
} from "../../types/subscription";

interface DataResponse<T> {
  data: T;
}

interface PlatformTenantListParams {
  q?: string;
  state?: "active" | "past_due" | "suspended";
  limit?: number;
}

export async function listPlatformSubscriptionTenants(params: PlatformTenantListParams = {}): Promise<PlatformSubscriptionTenantListItem[]> {
  const response = await httpClient.get<DataResponse<PlatformSubscriptionTenantListItem[]>>("/platform/subscriptions/tenants", {
    params: {
      q: params.q?.trim() || undefined,
      state: params.state || undefined,
      limit: params.limit ?? 60,
    },
  });

  return response.data.data;
}

export async function getPlatformSubscriptionTenantDetail(tenantId: string): Promise<PlatformSubscriptionTenantDetailPayload> {
  const response = await httpClient.get<DataResponse<PlatformSubscriptionTenantDetailPayload>>(`/platform/subscriptions/tenants/${tenantId}`);
  return response.data.data;
}

export async function verifyPlatformSubscriptionInvoice(payload: {
  invoiceId: string;
  decision: "approve" | "reject";
  note?: string;
}): Promise<PlatformSubscriptionInvoiceVerifyResult> {
  const response = await httpClient.post<DataResponse<PlatformSubscriptionInvoiceVerifyResult>>(
    `/platform/subscriptions/invoices/${payload.invoiceId}/verify`,
    {
      decision: payload.decision,
      note: payload.note?.trim() || undefined,
    }
  );

  return response.data.data;
}

export async function suspendPlatformSubscriptionTenant(tenantId: string, note?: string): Promise<PlatformSubscriptionTenantStateResult> {
  const response = await httpClient.post<DataResponse<PlatformSubscriptionTenantStateResult>>(`/platform/subscriptions/tenants/${tenantId}/suspend`, {
    note: note?.trim() || undefined,
  });

  return response.data.data;
}

export async function activatePlatformSubscriptionTenant(tenantId: string, note?: string): Promise<PlatformSubscriptionTenantStateResult> {
  const response = await httpClient.post<DataResponse<PlatformSubscriptionTenantStateResult>>(`/platform/subscriptions/tenants/${tenantId}/activate`, {
    note: note?.trim() || undefined,
  });

  return response.data.data;
}

interface PlatformPaymentEventsParams {
  tenantId?: string;
  status?: string;
  q?: string;
  limit?: number;
}

export async function listPlatformSubscriptionPaymentEvents(
  params: PlatformPaymentEventsParams = {}
): Promise<PlatformSubscriptionPaymentEvent[]> {
  const response = await httpClient.get<DataResponse<PlatformSubscriptionPaymentEvent[]>>("/platform/subscriptions/payments/events", {
    params: {
      tenant_id: params.tenantId || undefined,
      status: params.status || undefined,
      q: params.q?.trim() || undefined,
      limit: params.limit ?? 60,
    },
  });

  return response.data.data;
}
