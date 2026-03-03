import { httpClient } from "../../lib/httpClient";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { OrderDetail, OrderSummary } from "../../types/order";

interface OrdersResponse {
  data: OrderSummary[];
  meta?: {
    page: number;
    per_page: number;
    last_page: number;
    total: number;
    has_more: boolean;
  };
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
  page?: number;
  fetchAll?: boolean;
  query?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  timezone?: string;
  statusScope?: "all" | "open" | "completed";
  forceRefresh?: boolean;
}

interface StatusUpdateParams {
  orderId: string;
  status: string;
}

export interface SaveOrderPayload {
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
  pickup?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
}

interface AddOrderPaymentPayload {
  orderId: string;
  amount: number;
  method: string;
  paidAt?: string;
  notes?: string;
}

export interface OrderListPage {
  items: OrderSummary[];
  page: number;
  hasMore: boolean;
  total: number | null;
}

function buildOrderRequestBody(payload: SaveOrderPayload): Record<string, unknown> {
  return {
    outlet_id: payload.outletId,
    is_pickup_delivery: payload.isPickupDelivery ?? false,
    shipping_fee_amount: payload.shippingFeeAmount ?? 0,
    discount_amount: payload.discountAmount ?? 0,
    notes: payload.notes?.trim() || undefined,
    pickup: payload.pickup,
    delivery: payload.delivery,
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
  };
}

export async function listOrdersPage(params: Omit<ListOrdersParams, "fetchAll">): Promise<OrderListPage> {
  const limit = Math.min(params.limit ?? 30, 100);
  const page = Math.max(params.page ?? 1, 1);
  const query = params.query?.trim() ?? "";
  const date = params.date?.trim() ?? "";
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";
  const timezone = params.timezone?.trim() ?? "";
  const statusScope = params.statusScope ?? "all";
  const cacheKey = `orders:list:page:${params.outletId}:${limit}:${page}:${query}:${statusScope}:${date}:${dateFrom}:${dateTo}:${timezone}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<OrderListPage>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<OrdersResponse>("/orders", {
    params: {
      outlet_id: params.outletId,
      limit,
      page,
      q: query || undefined,
      status_scope: statusScope,
      date: date || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      timezone: timezone || undefined,
    },
  });

  const responseHasMore = response.data.meta?.has_more;
  const fallbackHasMore = response.data.data.length >= limit;
  const result: OrderListPage = {
    items: response.data.data,
    page,
    hasMore: typeof responseHasMore === "boolean" ? responseHasMore : fallbackHasMore,
    total: response.data.meta?.total ?? null,
  };

  setCachedValue(cacheKey, result, 20_000);
  return result;
}

export async function listOrders(params: ListOrdersParams): Promise<OrderSummary[]> {
  const limit = Math.min(params.limit ?? 30, 100);
  const page = Math.max(params.page ?? 1, 1);
  const fetchAll = params.fetchAll === true;
  const query = params.query?.trim() ?? "";
  const date = params.date?.trim() ?? "";
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";
  const timezone = params.timezone?.trim() ?? "";
  const statusScope = params.statusScope ?? "all";
  const cacheKey = `orders:list:${params.outletId}:${limit}:${query}:${statusScope}:${date}:${dateFrom}:${dateTo}:${timezone}:${fetchAll ? "all" : `page-${page}`}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<OrderSummary[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  if (!fetchAll) {
    const pageResult = await listOrdersPage({
      ...params,
      limit,
      page,
    });
    setCachedValue(cacheKey, pageResult.items, 20_000);
    return pageResult.items;
  }

  const merged: OrderSummary[] = [];
  const seen = new Set<string>();
  let nextPage = 1;
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 100) {
    guard += 1;
    let addedInPage = 0;

    const pageResult = await listOrdersPage({
      ...params,
      limit,
      page: nextPage,
    });

    for (const order of pageResult.items) {
      if (seen.has(order.id)) {
        continue;
      }

      seen.add(order.id);
      merged.push(order);
      addedInPage += 1;
    }

    hasMore = pageResult.hasMore && addedInPage > 0;
    nextPage += 1;
  }

  setCachedValue(cacheKey, merged, 20_000);
  return merged;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const response = await httpClient.get<OrderDetailResponse>(`/orders/${orderId}`);
  return response.data.data;
}

export async function createOrder(payload: SaveOrderPayload): Promise<OrderDetail> {
  const response = await httpClient.post<CreateOrderResponse>("/orders", buildOrderRequestBody(payload));

  invalidateCache("orders:list:");
  return response.data.data;
}

export async function updateOrder(orderId: string, payload: SaveOrderPayload): Promise<OrderDetail> {
  const response = await httpClient.patch<OrderDetailResponse>(`/orders/${orderId}`, buildOrderRequestBody(payload));

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

  const fallbackOrder = response.data.order ?? null;
  invalidateCache("orders:list:");

  try {
    return await getOrderDetail(payload.orderId);
  } catch {
    return fallbackOrder;
  }
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
