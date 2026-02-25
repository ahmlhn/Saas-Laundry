import { httpClient } from "../../lib/httpClient";
import type {
  PaymentGatewaySettings,
  PaymentGatewayTransaction,
  PaymentGatewayTransactionEvent,
  PaymentGatewayTransactionsPayload,
  PaymentGatewayTransactionsSummary,
} from "../../types/paymentGateway";

interface DataResponse<T> {
  data: T;
}

interface PaymentGatewaySettingsApiPayload {
  provider: string;
  outlet_id: string;
  client_id: string;
  client_secret_mask: string;
  has_client_secret: boolean;
  updated_at: string | null;
}

interface PaymentGatewayTransactionEventApiPayload {
  id: string;
  gateway_event_id: string;
  event_type: string;
  event_status: string | null;
  process_status: string;
  rejection_reason: string | null;
  received_at: string | null;
  processed_at: string | null;
}

interface PaymentGatewayTransactionApiPayload {
  intent_id: string;
  order_id: string;
  order_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  intent_reference: string;
  amount_total: number;
  currency: string;
  intent_status: string;
  is_paid: boolean;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  latest_event: PaymentGatewayTransactionEventApiPayload | null;
}

interface PaymentGatewayTransactionsSummaryApiPayload {
  total: number;
  paid: number;
  pending: number;
}

interface PaymentGatewayTransactionsApiPayload {
  settings: PaymentGatewaySettingsApiPayload;
  summary: PaymentGatewayTransactionsSummaryApiPayload;
  transactions: PaymentGatewayTransactionApiPayload[];
}

export interface UpsertPaymentGatewaySettingsPayload {
  outletId: string;
  clientId: string;
  clientSecret?: string;
}

function mapSettings(payload: PaymentGatewaySettingsApiPayload): PaymentGatewaySettings {
  return {
    provider: payload.provider,
    outletId: payload.outlet_id,
    clientId: payload.client_id || "",
    clientSecretMask: payload.client_secret_mask || "",
    hasClientSecret: payload.has_client_secret === true,
    updatedAt: payload.updated_at,
  };
}

function mapEvent(payload: PaymentGatewayTransactionEventApiPayload): PaymentGatewayTransactionEvent {
  return {
    id: payload.id,
    gatewayEventId: payload.gateway_event_id,
    eventType: payload.event_type,
    eventStatus: payload.event_status,
    processStatus: payload.process_status,
    rejectionReason: payload.rejection_reason,
    receivedAt: payload.received_at,
    processedAt: payload.processed_at,
  };
}

function mapTransaction(payload: PaymentGatewayTransactionApiPayload): PaymentGatewayTransaction {
  return {
    intentId: payload.intent_id,
    orderId: payload.order_id,
    orderCode: payload.order_code,
    customerName: payload.customer_name,
    customerPhone: payload.customer_phone,
    intentReference: payload.intent_reference,
    amountTotal: Number.isFinite(payload.amount_total) ? payload.amount_total : 0,
    currency: payload.currency || "IDR",
    intentStatus: payload.intent_status || "unknown",
    isPaid: payload.is_paid === true,
    expiresAt: payload.expires_at,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    latestEvent: payload.latest_event ? mapEvent(payload.latest_event) : null,
  };
}

function mapSummary(payload: PaymentGatewayTransactionsSummaryApiPayload): PaymentGatewayTransactionsSummary {
  return {
    total: payload.total ?? 0,
    paid: payload.paid ?? 0,
    pending: payload.pending ?? 0,
  };
}

export async function getPaymentGatewaySettings(outletId: string): Promise<PaymentGatewaySettings> {
  const response = await httpClient.get<DataResponse<PaymentGatewaySettingsApiPayload>>("/payment-gateway/settings", {
    params: { outlet_id: outletId },
  });

  return mapSettings(response.data.data);
}

export async function upsertPaymentGatewaySettings(payload: UpsertPaymentGatewaySettingsPayload): Promise<PaymentGatewaySettings> {
  const response = await httpClient.put<DataResponse<PaymentGatewaySettingsApiPayload>>("/payment-gateway/settings", {
    outlet_id: payload.outletId,
    client_id: payload.clientId,
    client_secret: payload.clientSecret,
  });

  return mapSettings(response.data.data);
}

export async function listPaymentGatewayQrisTransactions(outletId: string, limit = 30): Promise<PaymentGatewayTransactionsPayload> {
  const response = await httpClient.get<DataResponse<PaymentGatewayTransactionsApiPayload>>("/payment-gateway/qris-transactions", {
    params: {
      outlet_id: outletId,
      limit,
    },
  });

  return {
    settings: mapSettings(response.data.data.settings),
    summary: mapSummary(response.data.data.summary),
    transactions: response.data.data.transactions.map((item) => mapTransaction(item)),
  };
}

