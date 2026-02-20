import { httpClient } from "../../lib/httpClient";
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
}

interface StatusUpdateParams {
  orderId: string;
  status: string;
}

export async function listOrders(params: ListOrdersParams): Promise<OrderSummary[]> {
  const response = await httpClient.get<OrdersResponse>("/orders", {
    params: {
      outlet_id: params.outletId,
      limit: params.limit ?? 30,
    },
  });

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

  return response.data.data;
}

export async function updateCourierStatus(params: StatusUpdateParams): Promise<OrderDetail> {
  const response = await httpClient.post<OrderDetailResponse>(`/orders/${params.orderId}/status/courier`, {
    status: params.status,
  });

  return response.data.data;
}
