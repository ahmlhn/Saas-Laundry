import { httpClient } from "../../lib/httpClient";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { OrderDetail, OrderSummary } from "../../types/order";

interface OrdersResponse {
  data: OrderSummary[];
}

interface OrderDetailResponse {
  data: OrderDetail;
}

interface CreateOrderResponse {
  data: OrderDetail;
}

interface AddOrderPaymentResponse {
  data: {
    id: string;
    order_id: string;
    amount: number;
    method: string;
    paid_at: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  order?: OrderDetail;
}

export interface OrderQrisIntentPayload {
  id: string;
  order_id: string;
  provider: string;
  intent_reference: string;
  amount_total: number;
  currency: string;
  status: string;
  qris_payload: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderQrisEventPayload {
  id: string;
  order_id: string | null;
  provider: string;
  intent_id: string | null;
  gateway_event_id: string;
  event_type: string;
  event_status: string | null;
  amount_total: number | null;
  currency: string | null;
  gateway_reference: string | null;
  signature_valid: boolean;
  process_status: string;
  rejection_reason: string | null;
  received_at: string | null;
  processed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderQrisIntentResult {
  order: {
    id: string;
    order_code: string;
    total_amount: number;
    paid_amount: number;
    due_amount: number;
  };
  intent: OrderQrisIntentPayload;
}

export interface OrderQrisPaymentStatusPayload {
  order: {
    id: string;
    order_code: string;
    total_amount: number;
    paid_amount: number;
    due_amount: number;
  };
  latest_intent: OrderQrisIntentPayload | null;
  latest_event: OrderQrisEventPayload | null;
  events: OrderQrisEventPayload[];
}

interface CreateOrderQrisIntentResponse {
  data: OrderQrisIntentResult;
}

interface OrderQrisPaymentStatusResponse {
  data: OrderQrisPaymentStatusPayload;
}

interface ListOrdersParams {
  outletId: string;
  limit?: number;
  query?: string;
  date?: string;
  timezone?: string;
  forceRefresh?: boolean;
}

interface StatusUpdateParams {
  orderId: string;
  status: string;
}

interface CreateOrderPayload {
  outletId: string;
  customer: {
    name: string;
    phone: string;
    notes?: string;
  };
  items: Array<{
    serviceId: string;
    qty?: number;
    weightKg?: number;
  }>;
  notes?: string;
  isPickupDelivery?: boolean;
  shippingFeeAmount?: number;
  discountAmount?: number;
}

interface AddOrderPaymentPayload {
  orderId: string;
  amount: number;
  method: string;
  paidAt?: string;
  notes?: string;
}

export async function listOrders(params: ListOrdersParams): Promise<OrderSummary[]> {
  const limit = params.limit ?? 30;
  const query = params.query?.trim() ?? "";
  const date = params.date?.trim() ?? "";
  const timezone = params.timezone?.trim() ?? "";
  const cacheKey = `orders:list:${params.outletId}:${limit}:${query}:${date}:${timezone}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<OrderSummary[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<OrdersResponse>("/orders", {
    params: {
      outlet_id: params.outletId,
      limit,
      q: query || undefined,
      date: date || undefined,
      timezone: timezone || undefined,
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const response = await httpClient.get<OrderDetailResponse>(`/orders/${orderId}`);
  return response.data.data;
}

export async function createOrder(payload: CreateOrderPayload): Promise<OrderDetail> {
  const response = await httpClient.post<CreateOrderResponse>("/orders", {
    outlet_id: payload.outletId,
    is_pickup_delivery: payload.isPickupDelivery ?? false,
    shipping_fee_amount: payload.shippingFeeAmount ?? 0,
    discount_amount: payload.discountAmount ?? 0,
    notes: payload.notes?.trim() || undefined,
    customer: {
      name: payload.customer.name,
      phone: payload.customer.phone,
      notes: payload.customer.notes?.trim() || undefined,
    },
    items: payload.items.map((item) => ({
      service_id: item.serviceId,
      qty: item.qty,
      weight_kg: item.weightKg,
    })),
  });

  invalidateCache("orders:list:");
  return response.data.data;
}

export async function addOrderPayment(payload: AddOrderPaymentPayload): Promise<OrderDetail | null> {
  const response = await httpClient.post<AddOrderPaymentResponse>(`/orders/${payload.orderId}/payments`, {
    amount: payload.amount,
    method: payload.method,
    paid_at: payload.paidAt,
    notes: payload.notes?.trim() || undefined,
  });

  invalidateCache("orders:list:");
  return response.data.order ?? null;
}

export async function createOrderQrisIntent(payload: { orderId: string; amount?: number }): Promise<OrderQrisIntentResult> {
  const response = await httpClient.post<CreateOrderQrisIntentResponse>(`/orders/${payload.orderId}/payments/qris-intent`, {
    amount: payload.amount,
  });

  invalidateCache("orders:list:");
  return response.data.data;
}

export async function getOrderQrisPaymentStatus(orderId: string): Promise<OrderQrisPaymentStatusPayload> {
  const response = await httpClient.get<OrderQrisPaymentStatusResponse>(`/orders/${orderId}/payments/qris-status`);
  return response.data.data;
}

export async function updateLaundryStatus(params: StatusUpdateParams): Promise<OrderDetail> {
  const response = await httpClient.post<OrderDetailResponse>(`/orders/${params.orderId}/status/laundry`, {
    status: params.status,
  });

  invalidateCache("orders:list:");
  return response.data.data;
}

export async function updateCourierStatus(params: StatusUpdateParams): Promise<OrderDetail> {
  const response = await httpClient.post<OrderDetailResponse>(`/orders/${params.orderId}/status/courier`, {
    status: params.status,
  });

  invalidateCache("orders:list:");
  return response.data.data;
}
