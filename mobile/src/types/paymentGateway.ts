export interface PaymentGatewaySettings {
  provider: string;
  outletId: string;
  clientId: string;
  clientSecretMask: string;
  hasClientSecret: boolean;
  updatedAt: string | null;
}

export interface PaymentGatewayTransactionEvent {
  id: string;
  gatewayEventId: string;
  eventType: string;
  eventStatus: string | null;
  processStatus: string;
  rejectionReason: string | null;
  receivedAt: string | null;
  processedAt: string | null;
}

export interface PaymentGatewayTransaction {
  intentId: string;
  orderId: string;
  orderCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  intentReference: string;
  amountTotal: number;
  currency: string;
  intentStatus: string;
  isPaid: boolean;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  latestEvent: PaymentGatewayTransactionEvent | null;
}

export interface PaymentGatewayTransactionsSummary {
  total: number;
  paid: number;
  pending: number;
}

export interface PaymentGatewayTransactionsPayload {
  settings: PaymentGatewaySettings;
  summary: PaymentGatewayTransactionsSummary;
  transactions: PaymentGatewayTransaction[];
}

