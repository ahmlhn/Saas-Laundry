import { httpClient } from "../../lib/httpClient";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { OrderDetail, OrderSummary } from "../../types/order";

interface OrdersResponse {
  data: OrderSummary[];
}

interface OrderDetailResponse {
  data: OrderDetail;
}

interface ListOrdersParams {
  outletId: string;
  limit?: number;
  forceRefresh?: boolean;
}

interface StatusUpdateParams {
  orderId: string;
  status: string;
}

export async function listOrders(params: ListOrdersParams): Promise<OrderSummary[]> {
  const limit = params.limit ?? 30;
  const cacheKey = `orders:list:${params.outletId}:${limit}`;

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
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const response = await httpClient.get<OrderDetailResponse>(`/orders/${orderId}`);
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
