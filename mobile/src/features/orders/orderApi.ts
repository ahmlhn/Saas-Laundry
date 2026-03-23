import { httpClient } from "../../lib/httpClient";
import { createShortOrderCode, createUuid } from "../../lib/randomId";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import { toDateToken } from "../../lib/dateTime";
import {
  applyLocalSyncPullChanges,
  deleteLocalOrder,
  hasAnyLocalOrders,
  readLocalOrderDetail,
  readLocalOrdersPage,
  upsertLocalOrderDetail,
  upsertLocalOrderSummaries,
} from "../repositories/ordersRepository";
import { readLocalCustomerById, upsertLocalCustomer } from "../repositories/customersRepository";
import { nowIsoString } from "../repositories/repositoryShared";
import { readLocalServicesByIds } from "../repositories/servicesRepository";
import { consumeInvoiceNumberFromLease } from "../sync/invoiceLeaseRepository";
import { enqueueOutboxMutation } from "../sync/outboxRepository";
import { ensureOrderMutationAppliedOrThrow, syncPendingMutationsIfOnline } from "../sync/syncCoordinator";
import { pullAllSyncChangesForOutlet } from "../sync/syncApi";
import type { OrderDetail, OrderSummary } from "../../types/order";
import type { Customer } from "../../types/customer";
import type { ServiceCatalogItem } from "../../types/service";

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

interface DeleteOrderResponse {
  data: {
    id: string;
  };
  message?: string;
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
  customerId?: string;
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
  requiresPickup?: boolean;
  requiresDelivery?: boolean;
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

function resolveCourierFlowFlags(payload: SaveOrderPayload): { requiresPickup: boolean; requiresDelivery: boolean; hasCourierFlow: boolean } {
  const requiresPickup = payload.requiresPickup ?? (payload.isPickupDelivery ?? false);
  const requiresDelivery = payload.requiresDelivery ?? (payload.isPickupDelivery ?? false);

  return {
    requiresPickup,
    requiresDelivery,
    hasCourierFlow: requiresPickup || requiresDelivery,
  };
}

async function fetchOrdersPageFromServer(params: Omit<ListOrdersParams, "fetchAll">): Promise<OrderListPage> {
  const limit = Math.min(params.limit ?? 30, 100);
  const page = Math.max(params.page ?? 1, 1);
  const query = params.query?.trim() ?? "";
  const date = params.date?.trim() ?? "";
  const dateFrom = params.dateFrom?.trim() ?? "";
  const dateTo = params.dateTo?.trim() ?? "";
  const timezone = params.timezone?.trim() ?? "";
  const statusScope = params.statusScope ?? "all";

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

  await upsertLocalOrderSummaries(result.items);
  return result;
}

async function fetchOrderDetailFromServer(orderId: string): Promise<OrderDetail> {
  const response = await httpClient.get<OrderDetailResponse>(`/orders/${orderId}`);
  await upsertLocalOrderDetail(response.data.data);
  return response.data.data;
}

function buildOrderRequestBody(payload: SaveOrderPayload): Record<string, unknown> {
  const { requiresPickup, requiresDelivery, hasCourierFlow } = resolveCourierFlowFlags(payload);

  return {
    outlet_id: payload.outletId,
    is_pickup_delivery: hasCourierFlow,
    requires_pickup: requiresPickup,
    requires_delivery: requiresDelivery,
    shipping_fee_amount: hasCourierFlow ? (payload.shippingFeeAmount ?? 0) : 0,
    discount_amount: payload.discountAmount ?? 0,
    notes: payload.notes?.trim() || undefined,
    pickup: requiresPickup ? payload.pickup : undefined,
    delivery: requiresDelivery ? payload.delivery : undefined,
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

function buildOrderCreateMutationPayload(
  orderId: string,
  orderCode: string,
  invoiceNo: string | null,
  payload: SaveOrderPayload
): Record<string, unknown> {
  const { requiresPickup, requiresDelivery, hasCourierFlow } = resolveCourierFlowFlags(payload);

  return {
    id: orderId,
    outlet_id: payload.outletId,
    order_code: orderCode,
    invoice_no: invoiceNo,
    is_pickup_delivery: hasCourierFlow,
    requires_pickup: requiresPickup,
    requires_delivery: requiresDelivery,
    shipping_fee_amount: hasCourierFlow ? (payload.shippingFeeAmount ?? 0) : 0,
    discount_amount: payload.discountAmount ?? 0,
    notes: payload.notes?.trim() || undefined,
    pickup: requiresPickup ? payload.pickup : undefined,
    delivery: requiresDelivery ? payload.delivery : undefined,
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

function calculateEstimatedCompletion(
  createdAtIso: string,
  items: ServiceCatalogItem[]
): Pick<OrderDetail, "estimated_completion_at" | "estimated_completion_duration_days" | "estimated_completion_duration_hours" | "estimated_completion_is_late"> {
  const maxDurationMinutes = items.reduce((currentMax, item) => {
    const days = Math.max(item.duration_days ?? 0, 0);
    const hours = Math.max(item.duration_hours ?? 0, 0);
    return Math.max(currentMax, (days * 24 * 60) + (hours * 60));
  }, 0);

  if (maxDurationMinutes <= 0) {
    return {
      estimated_completion_at: null,
      estimated_completion_duration_days: null,
      estimated_completion_duration_hours: 0,
      estimated_completion_is_late: false,
    };
  }

  const createdAt = new Date(createdAtIso);
  const estimatedAt = new Date(createdAt.getTime() + maxDurationMinutes * 60 * 1000);

  return {
    estimated_completion_at: estimatedAt.toISOString(),
    estimated_completion_duration_days: Math.floor(maxDurationMinutes / (24 * 60)),
    estimated_completion_duration_hours: Math.floor((maxDurationMinutes % (24 * 60)) / 60),
    estimated_completion_is_late: false,
  };
}

async function buildOptimisticOrderDetail(orderId: string, payload: SaveOrderPayload): Promise<OrderDetail> {
  const createdAt = nowIsoString();
  const { requiresPickup, requiresDelivery, hasCourierFlow } = resolveCourierFlowFlags(payload);
  const orderCode = createShortOrderCode();
  const invoiceNo = await consumeInvoiceNumberFromLease(payload.outletId, toDateToken(new Date(createdAt)));
  const localCustomer = payload.customerId ? await readLocalCustomerById(payload.customerId) : null;
  const services = await readLocalServicesByIds(
    payload.outletId,
    payload.items.map((item) => item.serviceId)
  );
  const serviceById = new Map(services.map((service) => [service.id, service]));
  const serviceItems = payload.items
    .map((item) => {
      const service = serviceById.get(item.serviceId);
      const metricValue = typeof item.weightKg === "number" ? item.weightKg : item.qty ?? 0;
      const unitPrice = service?.effective_price_amount ?? service?.base_price_amount ?? 0;
      const subtotal = Math.max(Math.round(metricValue * unitPrice), 0);

      return {
        id: createUuid(),
        order_id: orderId,
        service_id: item.serviceId,
        service_name_snapshot: service?.name ?? "Layanan",
        unit_type_snapshot: service?.unit_type ?? (typeof item.weightKg === "number" ? "kg" : "pcs"),
        qty: typeof item.qty === "number" ? item.qty : null,
        weight_kg: typeof item.weightKg === "number" ? item.weightKg : null,
        unit_price_amount: unitPrice,
        subtotal_amount: subtotal,
        created_at: createdAt,
        updated_at: createdAt,
        service: service
          ? {
              id: service.id,
              duration_days: service.duration_days,
              duration_hours: service.duration_hours,
              service_type: service.service_type,
            }
          : null,
      };
    })
    .filter((item) => item.subtotal_amount > 0 || item.qty !== null || item.weight_kg !== null);

  const subtotalAmount = serviceItems.reduce((sum, item) => sum + item.subtotal_amount, 0);
  const shippingFeeAmount = hasCourierFlow ? payload.shippingFeeAmount ?? 0 : 0;
  const discountAmount = payload.discountAmount ?? 0;
  const totalAmount = Math.max(subtotalAmount + shippingFeeAmount - discountAmount, 0);
  const customerId = payload.customerId ?? localCustomer?.id ?? createUuid();
  const tenantId = localCustomer?.tenant_id ?? services[0]?.tenant_id ?? "";

  const customerSnapshot: Customer = {
    id: customerId,
    tenant_id: tenantId,
    name: payload.customer.name,
    phone_normalized: payload.customer.phone,
    notes: payload.customer.notes?.trim() || null,
    created_at: localCustomer?.created_at ?? createdAt,
    updated_at: createdAt,
    deleted_at: null,
    orders_count: localCustomer?.orders_count,
  };
  await upsertLocalCustomer(customerSnapshot);

  const estimatedCompletion = calculateEstimatedCompletion(
    createdAt,
    serviceItems
      .map((item) => serviceById.get(item.service_id))
      .filter((service): service is ServiceCatalogItem => Boolean(service))
  );

  return {
    id: orderId,
    tenant_id: tenantId,
    outlet_id: payload.outletId,
    customer_id: customerId,
    courier_user_id: null,
    invoice_no: invoiceNo,
    order_code: orderCode,
    is_pickup_delivery: hasCourierFlow,
    requires_pickup: requiresPickup,
    requires_delivery: requiresDelivery,
    laundry_status: "received",
    courier_status: requiresPickup ? "pickup_pending" : requiresDelivery ? "at_outlet" : null,
    total_amount: totalAmount,
    paid_amount: 0,
    due_amount: totalAmount,
    created_at: createdAt,
    updated_at: createdAt,
    shipping_fee_amount: shippingFeeAmount,
    discount_amount: discountAmount,
    notes: payload.notes?.trim() || null,
    pickup: requiresPickup ? payload.pickup ?? null : null,
    delivery: requiresDelivery ? payload.delivery ?? null : null,
    items: serviceItems,
    payments: [],
    customer: {
      id: customerId,
      name: payload.customer.name,
      phone_normalized: payload.customer.phone,
      notes: payload.customer.notes?.trim() || null,
    },
    courier: null,
    ...estimatedCompletion,
    local_sync_status: "pending",
    local_pending_mutation_count: 1,
    local_rejected_mutation_count: 0,
    local_sync_error_code: null,
    local_sync_error_message: null,
  };
}

async function buildOptimisticPaymentOrderDetail(payload: AddOrderPaymentPayload): Promise<{ order: OrderDetail; mutationId: string }> {
  const baseDetail = (await readLocalOrderDetail(payload.orderId)) ?? (await fetchOrderDetailFromServer(payload.orderId));
  const createdAt = nowIsoString();
  const paymentId = createUuid();
  const nextPayments = [
    ...(baseDetail.payments ?? []),
    {
      id: paymentId,
      order_id: payload.orderId,
      amount: payload.amount,
      method: payload.method,
      paid_at: payload.paidAt ?? createdAt,
      notes: payload.notes?.trim() || null,
      created_at: createdAt,
      updated_at: createdAt,
    },
  ];
  const paidAmount = nextPayments.reduce((sum, payment) => sum + Math.max(payment.amount, 0), 0);
  const nextOrder: OrderDetail = {
    ...baseDetail,
    payments: nextPayments,
    paid_amount: paidAmount,
    due_amount: Math.max(baseDetail.total_amount - paidAmount, 0),
    updated_at: createdAt,
    local_sync_status: "pending",
  };

  return {
    order: nextOrder,
    mutationId: paymentId,
  };
}

async function buildOptimisticStatusOrderDetail(orderId: string, patch: Partial<Pick<OrderDetail, "laundry_status" | "courier_status">>): Promise<OrderDetail> {
  const baseDetail = (await readLocalOrderDetail(orderId)) ?? (await fetchOrderDetailFromServer(orderId));
  return {
    ...baseDetail,
    ...patch,
    updated_at: nowIsoString(),
    local_sync_status: "pending",
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

  const localPage = await readLocalOrdersPage({
    outletId: params.outletId,
    limit,
    page,
    query,
    date,
    dateFrom,
    dateTo,
    timezone,
    statusScope,
  });
  const hasLocalSnapshot = await hasAnyLocalOrders(params.outletId);
  const pageOffset = (page - 1) * limit;
  const canServeFromLocal =
    hasLocalSnapshot &&
    (page === 1 || localPage.items.length > 0 || Number(localPage.total ?? 0) <= pageOffset);

  if (!params.forceRefresh && canServeFromLocal) {
    setCachedValue(cacheKey, localPage, 20_000);
    return localPage;
  }

  let result = localPage;

  try {
    const syncResult = await pullAllSyncChangesForOutlet({
      outletId: params.outletId,
      limit: 200,
    });
    if (syncResult.changes.length > 0) {
      await applyLocalSyncPullChanges(syncResult.changes);
    }

    await fetchOrdersPageFromServer({
      ...params,
      limit,
      page,
      query,
      date,
      dateFrom,
      dateTo,
      timezone,
      statusScope,
    });
    result = await readLocalOrdersPage({
      outletId: params.outletId,
      limit,
      page,
      query,
      date,
      dateFrom,
      dateTo,
      timezone,
      statusScope,
    });
  } catch (error) {
    if (!hasLocalSnapshot) {
      throw error;
    }
  }

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
    }

    hasMore = pageResult.hasMore;
    nextPage += 1;
  }

  setCachedValue(cacheKey, merged, 20_000);
  return merged;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail> {
  const localDetail = await readLocalOrderDetail(orderId);

  try {
    return await fetchOrderDetailFromServer(orderId);
  } catch (error) {
    if (localDetail) {
      return localDetail;
    }

    throw error;
  }
}

export async function createOrder(payload: SaveOrderPayload): Promise<OrderDetail> {
  invalidateCache("orders:list:");
  const orderId = createUuid();
  const optimisticOrder = await buildOptimisticOrderDetail(orderId, payload);
  await upsertLocalOrderDetail(optimisticOrder);
  const mutation = await enqueueOutboxMutation({
    mutation_id: createUuid(),
    type: "ORDER_CREATE",
    outlet_id: payload.outletId,
    entity_type: "order",
    entity_id: orderId,
    client_time: optimisticOrder.created_at,
    payload: buildOrderCreateMutationPayload(orderId, optimisticOrder.order_code, optimisticOrder.invoice_no, payload),
  });

  try {
    await syncPendingMutationsIfOnline({
      selectedOutletId: payload.outletId,
    });
    await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Pesanan belum bisa disinkronkan.");
  } catch {
    await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Pesanan belum bisa disinkronkan.");
  }

  return (await readLocalOrderDetail(orderId)) ?? optimisticOrder;
}

export async function updateOrder(orderId: string, payload: SaveOrderPayload): Promise<OrderDetail> {
  const response = await httpClient.patch<OrderDetailResponse>(`/orders/${orderId}`, buildOrderRequestBody(payload));

  invalidateCache("orders:list:");
  await upsertLocalOrderDetail(response.data.data);
  return response.data.data;
}

export async function cancelOrder(payload: { orderId: string; reason: string }): Promise<OrderDetail> {
  const response = await httpClient.post<OrderDetailResponse>(`/orders/${payload.orderId}/cancel`, {
    reason: payload.reason,
  });

  invalidateCache("orders:list:");
  await upsertLocalOrderDetail(response.data.data);
  return response.data.data;
}

export async function deleteOrder(orderId: string): Promise<string> {
  const response = await httpClient.delete<DeleteOrderResponse>(`/orders/${orderId}`);

  invalidateCache("orders:list:");
  await deleteLocalOrder(orderId);
  return response.data.data.id;
}

export async function addOrderPayment(payload: AddOrderPaymentPayload): Promise<OrderDetail | null> {
  invalidateCache("orders:list:");
  try {
    const { order, mutationId } = await buildOptimisticPaymentOrderDetail(payload);
    await upsertLocalOrderDetail(order);
    const mutation = await enqueueOutboxMutation({
      mutation_id: createUuid(),
      type: "ORDER_ADD_PAYMENT",
      outlet_id: order.outlet_id,
      entity_type: "order",
      entity_id: order.id,
      client_time: order.updated_at,
      payload: {
        id: mutationId,
        order_id: payload.orderId,
        amount: payload.amount,
        method: payload.method,
        paid_at: payload.paidAt ?? undefined,
        notes: payload.notes?.trim() || undefined,
      },
    });

    try {
      await syncPendingMutationsIfOnline({
        selectedOutletId: order.outlet_id,
      });
      await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Pembayaran belum bisa disinkronkan.");
    } catch {
      await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Pembayaran belum bisa disinkronkan.");
    }

    return (await readLocalOrderDetail(payload.orderId)) ?? order;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Pembayaran belum bisa dicatat.");
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
  invalidateCache("orders:list:");
  const optimisticOrder = await buildOptimisticStatusOrderDetail(params.orderId, {
    laundry_status: params.status,
  });
  await upsertLocalOrderDetail(optimisticOrder);
  const mutation = await enqueueOutboxMutation({
    mutation_id: createUuid(),
    type: "ORDER_UPDATE_LAUNDRY_STATUS",
    outlet_id: optimisticOrder.outlet_id,
    entity_type: "order",
    entity_id: optimisticOrder.id,
    client_time: optimisticOrder.updated_at,
    payload: {
      order_id: params.orderId,
      status: params.status,
    },
  });

  try {
    await syncPendingMutationsIfOnline({
      selectedOutletId: optimisticOrder.outlet_id,
    });
    await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Status laundry belum bisa disinkronkan.");
  } catch {
    await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Status laundry belum bisa disinkronkan.");
  }

  return (await readLocalOrderDetail(params.orderId)) ?? optimisticOrder;
}

export async function updateCourierStatus(params: StatusUpdateParams): Promise<OrderDetail> {
  invalidateCache("orders:list:");
  const optimisticOrder = await buildOptimisticStatusOrderDetail(params.orderId, {
    courier_status: params.status,
  });
  await upsertLocalOrderDetail(optimisticOrder);
  const mutation = await enqueueOutboxMutation({
    mutation_id: createUuid(),
    type: "ORDER_UPDATE_COURIER_STATUS",
    outlet_id: optimisticOrder.outlet_id,
    entity_type: "order",
    entity_id: optimisticOrder.id,
    client_time: optimisticOrder.updated_at,
    payload: {
      order_id: params.orderId,
      status: params.status,
    },
  });

  try {
    await syncPendingMutationsIfOnline({
      selectedOutletId: optimisticOrder.outlet_id,
    });
    await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Status kurir belum bisa disinkronkan.");
  } catch {
    await ensureOrderMutationAppliedOrThrow(mutation.mutation_id, "Status kurir belum bisa disinkronkan.");
  }

  return (await readLocalOrderDetail(params.orderId)) ?? optimisticOrder;
}
