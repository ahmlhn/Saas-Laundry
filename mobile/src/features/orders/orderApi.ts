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
