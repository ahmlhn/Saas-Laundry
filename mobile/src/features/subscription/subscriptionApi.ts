import { httpClient } from "../../lib/httpClient";
import type {
  SubscriptionChangeRequest,
  SubscriptionCurrentPayload,
  SubscriptionGatewayStatus,
  SubscriptionInvoice,
  SubscriptionInvoiceProofUploadPayload,
  SubscriptionPaymentIntentPayload,
  SubscriptionPlanOption,
} from "../../types/subscription";

interface DataResponse<T> {
  data: T;
}

export async function getSubscriptionCurrent(): Promise<SubscriptionCurrentPayload> {
  const response = await httpClient.get<DataResponse<SubscriptionCurrentPayload>>("/subscriptions/current");
  return response.data.data;
}

export async function listSubscriptionPlans(): Promise<SubscriptionPlanOption[]> {
  const response = await httpClient.get<DataResponse<SubscriptionPlanOption[]>>("/subscriptions/plans");
  return response.data.data;
}

export async function createSubscriptionChangeRequest(targetPlanId: number, note?: string): Promise<SubscriptionChangeRequest> {
  const response = await httpClient.post<DataResponse<SubscriptionChangeRequest>>("/subscriptions/change-request", {
    target_plan_id: targetPlanId,
    note: note?.trim() || undefined,
  });
  return response.data.data;
}

export async function cancelSubscriptionChangeRequest(changeRequestId: string): Promise<SubscriptionChangeRequest> {
  const response = await httpClient.delete<DataResponse<SubscriptionChangeRequest>>(`/subscriptions/change-request/${changeRequestId}`);
  return response.data.data;
}

export async function listSubscriptionInvoices(limit = 30): Promise<SubscriptionInvoice[]> {
  const response = await httpClient.get<DataResponse<SubscriptionInvoice[]>>("/subscriptions/invoices", {
    params: {
      limit,
    },
  });
  return response.data.data;
}

export async function createSubscriptionQrisIntent(invoiceId: string): Promise<SubscriptionPaymentIntentPayload> {
  const response = await httpClient.post<DataResponse<SubscriptionPaymentIntentPayload>>(`/subscriptions/invoices/${invoiceId}/qris-intent`);
  return response.data.data;
}

export async function getSubscriptionInvoicePaymentStatus(invoiceId: string): Promise<SubscriptionGatewayStatus> {
  const response = await httpClient.get<DataResponse<SubscriptionGatewayStatus>>(`/subscriptions/invoices/${invoiceId}/payment-status`);
  return response.data.data;
}

export interface UploadSubscriptionInvoiceProofPayload {
  invoiceId: string;
  uri: string;
  fileName?: string;
  mimeType?: string;
  note?: string;
}

export async function uploadSubscriptionInvoiceProof(payload: UploadSubscriptionInvoiceProofPayload): Promise<SubscriptionInvoiceProofUploadPayload> {
  const formData = new FormData();
  const uriExtensionMatch = payload.uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const uriExtension = uriExtensionMatch?.[1]?.toLowerCase() || "";
  const resolvedType =
    payload.mimeType?.trim() ||
    (uriExtension === "png"
      ? "image/png"
      : uriExtension === "pdf"
        ? "application/pdf"
        : "image/jpeg");
  const extension = uriExtension || (resolvedType === "application/pdf" ? "pdf" : "jpg");
  const fileName = payload.fileName?.trim() || `subscription-proof-${Date.now()}.${extension}`;

  formData.append(
    "proof_file",
    {
      uri: payload.uri,
      name: fileName,
      type: resolvedType,
    } as any
  );

  if (payload.note?.trim()) {
    formData.append("note", payload.note.trim());
  }

  const response = await httpClient.post<DataResponse<SubscriptionInvoiceProofUploadPayload>>(
    `/subscriptions/invoices/${payload.invoiceId}/proof`,
    formData
  );

  return response.data.data;
}
