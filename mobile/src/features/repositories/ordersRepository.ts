import { getLocalDatabase } from "../localdb/database";
import { toDateToken } from "../../lib/dateTime";
import type { Customer } from "../../types/customer";
import type { OrderDetail, OrderItemDetail, OrderPaymentDetail, OrderSummary } from "../../types/order";
import { nowIsoString, normalizeNumericText, normalizeSearchText, safeJsonParse, toDbBoolean } from "./repositoryShared";
import { upsertLocalCustomer } from "./customersRepository";

export interface LocalOrdersQueryParams {
  outletId: string;
  limit?: number;
  page?: number;
  query?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  timezone?: string;
  statusScope?: "all" | "open" | "completed";
}

export interface LocalOrderListPage {
  items: OrderSummary[];
  page: number;
  hasMore: boolean;
  total: number | null;
}

export interface LocalSyncPullChange {
  change_id: string;
  entity_type: string;
  entity_id: string;
  op: "upsert" | "delete" | string;
  updated_at: string;
  data: Record<string, unknown> | null;
}

interface LocalOrderRow {
  id: string;
  customer_name: string | null;
  customer_phone_normalized: string | null;
  courier_name: string | null;
  summary_payload_json: string;
  detail_payload_json: string | null;
  pending_mutation_count: number | null;
  rejected_mutation_count: number | null;
  latest_rejected_reason_code: string | null;
  latest_rejected_message: string | null;
}

interface LocalPayloadRow {
  payload_json: string;
}

function normalizeSummary(order: OrderSummary): OrderSummary {
  return {
    ...order,
    invoice_no: order.invoice_no ?? null,
    courier_status: order.courier_status ?? null,
    requires_pickup: typeof order.requires_pickup === "boolean" ? order.requires_pickup : order.is_pickup_delivery,
    requires_delivery: typeof order.requires_delivery === "boolean" ? order.requires_delivery : order.is_pickup_delivery,
    is_cancelled: Boolean(order.is_cancelled || order.cancelled_at),
    cancelled_at: order.cancelled_at ?? null,
    cancelled_reason: order.cancelled_reason ?? null,
    local_sync_status: order.local_sync_status ?? "synced",
    local_pending_mutation_count: order.local_pending_mutation_count ?? 0,
    local_rejected_mutation_count: order.local_rejected_mutation_count ?? 0,
    local_sync_error_code: order.local_sync_error_code ?? null,
    local_sync_error_message: order.local_sync_error_message ?? null,
    customer: order.customer
      ? {
          id: order.customer.id,
          name: order.customer.name,
          phone_normalized: order.customer.phone_normalized,
        }
      : undefined,
    courier: order.courier
      ? {
          id: order.courier.id,
          name: order.courier.name,
        }
      : order.courier ?? null,
  };
}

function applyLocalSyncMetadata<T extends OrderSummary>(order: T, row?: LocalOrderRow | null): T {
  const pendingCount = Math.max(Number(row?.pending_mutation_count ?? 0), 0);
  const rejectedCount = Math.max(Number(row?.rejected_mutation_count ?? 0), 0);
  const localSyncStatus = rejectedCount > 0 ? "failed" : pendingCount > 0 ? "pending" : "synced";

  return {
    ...order,
    local_sync_status: localSyncStatus,
    local_pending_mutation_count: pendingCount,
    local_rejected_mutation_count: rejectedCount,
    local_sync_error_code: row?.latest_rejected_reason_code ?? null,
    local_sync_error_message: row?.latest_rejected_message ?? null,
  };
}

function normalizeDetail(order: OrderDetail): OrderDetail {
  const summary = normalizeSummary(order);

  return {
    ...summary,
    shipping_fee_amount: order.shipping_fee_amount ?? 0,
    discount_amount: order.discount_amount ?? 0,
    notes: order.notes ?? null,
    estimated_completion_at: order.estimated_completion_at ?? null,
    estimated_completion_duration_days: order.estimated_completion_duration_days ?? null,
    estimated_completion_duration_hours: order.estimated_completion_duration_hours ?? 0,
    estimated_completion_is_late: Boolean(order.estimated_completion_is_late),
    pickup: order.pickup ?? null,
    delivery: order.delivery ?? null,
    items: (order.items ?? []).map((item) => ({
      ...item,
      qty: item.qty ?? null,
      weight_kg: item.weight_kg ?? null,
      created_at: item.created_at ?? "",
      updated_at: item.updated_at ?? "",
    })),
    payments: (order.payments ?? []).map((payment) => ({
      ...payment,
      paid_at: payment.paid_at ?? null,
      notes: payment.notes ?? null,
      created_at: payment.created_at ?? "",
      updated_at: payment.updated_at ?? "",
    })),
    customer: order.customer
      ? summary.customer
        ? {
            ...summary.customer,
            notes: order.customer.notes ?? null,
          }
        : {
            id: order.customer.id,
            name: order.customer.name,
            phone_normalized: order.customer.phone_normalized,
            notes: order.customer.notes ?? null,
          }
      : summary.customer,
    courier: order.courier
      ? {
          id: order.courier.id,
          name: order.courier.name,
          phone: order.courier.phone ?? null,
        }
      : summary.courier,
  };
}

function coerceNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function coerceBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

async function readCustomerIdentity(customerId: string | null | undefined): Promise<OrderSummary["customer"] | undefined> {
  if (!customerId) {
    return undefined;
  }

  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<{ payload_json: string }>("SELECT payload_json FROM customers WHERE id = ? LIMIT 1;", [customerId]);
  if (!row?.payload_json) {
    return undefined;
  }

  const customer = safeJsonParse<Customer>(row.payload_json, {} as Customer);
  if (!customer.id) {
    return undefined;
  }

  return {
    id: customer.id,
    name: customer.name,
    phone_normalized: customer.phone_normalized,
  };
}

async function readLocalOrderRow(orderId: string): Promise<LocalOrderRow | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<LocalOrderRow>(
    `
      SELECT
        orders.id,
        orders.customer_name,
        orders.customer_phone_normalized,
        orders.courier_name,
        orders.summary_payload_json,
        orders.detail_payload_json,
        (
          SELECT COUNT(*)
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'pending'
        ) AS pending_mutation_count,
        (
          SELECT COUNT(*)
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'rejected'
        ) AS rejected_mutation_count,
        (
          SELECT reason_code
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'rejected'
          ORDER BY seq DESC
          LIMIT 1
        ) AS latest_rejected_reason_code,
        (
          SELECT message
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'rejected'
          ORDER BY seq DESC
          LIMIT 1
        ) AS latest_rejected_message
      FROM orders
      WHERE orders.id = ?
      LIMIT 1;
    `,
    [orderId]
  );

  return row ?? null;
}

function buildOrderSearchText(order: OrderSummary | OrderDetail, row?: LocalOrderRow | null): string {
  const notes = "notes" in order ? order.notes : null;
  return normalizeSearchText([
    order.invoice_no,
    order.order_code,
    order.customer?.name ?? row?.customer_name,
    order.customer?.phone_normalized ?? row?.customer_phone_normalized,
    order.courier?.name ?? row?.courier_name,
    notes,
    order.cancelled_reason,
  ]);
}

function matchesStatusScope(order: OrderSummary, scope: "all" | "open" | "completed"): boolean {
  if (scope === "all") {
    return true;
  }

  if (order.is_cancelled) {
    return false;
  }

  const requiresDelivery = typeof order.requires_delivery === "boolean" ? order.requires_delivery : order.is_pickup_delivery;

  if (scope === "open") {
    return !requiresDelivery ? order.laundry_status !== "completed" : order.courier_status !== "delivered";
  }

  return !requiresDelivery ? order.laundry_status === "completed" : order.courier_status === "delivered";
}

function matchesDate(order: OrderSummary, params: LocalOrdersQueryParams): boolean {
  const createdAt = new Date(order.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return true;
  }

  const token = toDateToken(createdAt, params.timezone);
  const exact = params.date?.trim();
  if (exact) {
    return token === exact;
  }

  const from = params.dateFrom?.trim();
  const to = params.dateTo?.trim();
  if (!from && !to) {
    return true;
  }

  const start = from || to || token;
  const end = to || from || token;
  const rangeStart = start <= end ? start : end;
  const rangeEnd = end >= start ? end : start;

  return token >= rangeStart && token <= rangeEnd;
}

function matchesQuery(order: OrderSummary, keyword: string, row?: LocalOrderRow | null): boolean {
  if (keyword.length === 0) {
    return true;
  }

  const haystack = normalizeSearchText([
    order.invoice_no,
    order.order_code,
    order.customer?.name ?? row?.customer_name,
    order.customer?.phone_normalized ?? row?.customer_phone_normalized,
    order.courier?.name ?? row?.courier_name,
    order.cancelled_reason,
  ]);

  return haystack.includes(keyword);
}

async function readOrderItems(orderId: string): Promise<OrderItemDetail[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<LocalPayloadRow>(
    "SELECT payload_json FROM order_items WHERE order_id = ? ORDER BY created_at ASC, id ASC;",
    [orderId]
  );

  return rows.map((row) => safeJsonParse<OrderItemDetail>(row.payload_json, {} as OrderItemDetail));
}

async function readOrderPayments(orderId: string): Promise<OrderPaymentDetail[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<LocalPayloadRow>(
    "SELECT payload_json FROM order_payments WHERE order_id = ? ORDER BY created_at ASC, id ASC;",
    [orderId]
  );

  return rows.map((row) => safeJsonParse<OrderPaymentDetail>(row.payload_json, {} as OrderPaymentDetail));
}

export async function hasAnyLocalOrders(outletId: string): Promise<boolean> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) as total FROM orders WHERE outlet_id = ?;", [outletId]);
  return Number(row?.total ?? 0) > 0;
}

export async function readLocalOrdersPage(params: LocalOrdersQueryParams): Promise<LocalOrderListPage> {
  const db = await getLocalDatabase();
  const limit = Math.min(Math.max(params.limit ?? 30, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const keyword = params.query?.trim().toLowerCase() ?? "";

  const rows = await db.getAllAsync<LocalOrderRow>(
    `
      SELECT
        orders.id,
        orders.customer_name,
        orders.customer_phone_normalized,
        orders.courier_name,
        orders.summary_payload_json,
        orders.detail_payload_json,
        (
          SELECT COUNT(*)
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'pending'
        ) AS pending_mutation_count,
        (
          SELECT COUNT(*)
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'rejected'
        ) AS rejected_mutation_count,
        (
          SELECT reason_code
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'rejected'
          ORDER BY seq DESC
          LIMIT 1
        ) AS latest_rejected_reason_code,
        (
          SELECT message
          FROM outbox_mutations
          WHERE entity_type = 'order' AND entity_id = orders.id AND status = 'rejected'
          ORDER BY seq DESC
          LIMIT 1
        ) AS latest_rejected_message
      FROM orders
      WHERE orders.outlet_id = ?
      ${keyword.length > 0 ? "AND search_text LIKE ?" : ""}
      ORDER BY orders.created_at DESC, orders.updated_at DESC;
    `,
    keyword.length > 0 ? [params.outletId, `%${keyword}%`] : [params.outletId]
  );

  const filtered: OrderSummary[] = [];

  for (const row of rows) {
    const summary = applyLocalSyncMetadata(
      normalizeSummary(safeJsonParse<OrderSummary>(row.summary_payload_json, {} as OrderSummary)),
      row
    );
    const customer = summary.customer ?? (await readCustomerIdentity(summary.customer_id));
    const hydrated = applyLocalSyncMetadata(normalizeSummary({
      ...summary,
      customer,
      courier: summary.courier
        ? summary.courier
        : row.courier_name && summary.courier_user_id
          ? { id: summary.courier_user_id, name: row.courier_name }
          : null,
    }), row);

    if (!matchesQuery(hydrated, keyword, row)) {
      continue;
    }

    if (!matchesStatusScope(hydrated, params.statusScope ?? "all")) {
      continue;
    }

    if (!matchesDate(hydrated, params)) {
      continue;
    }

    filtered.push(hydrated);
  }

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return {
    items,
    page,
    hasMore: offset + items.length < total,
    total,
  };
}

export async function readLocalOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const row = await readLocalOrderRow(orderId);
  if (!row) {
    return null;
  }

  const summary = applyLocalSyncMetadata(
    normalizeSummary(safeJsonParse<OrderSummary>(row.summary_payload_json, {} as OrderSummary)),
    row
  );
  const detail = row.detail_payload_json
    ? applyLocalSyncMetadata(
        normalizeDetail(safeJsonParse<OrderDetail>(row.detail_payload_json, {} as OrderDetail)),
        row
      )
    : null;
  const customer = detail?.customer ?? summary.customer ?? (await readCustomerIdentity(summary.customer_id));
  const items = await readOrderItems(orderId);
  const payments = await readOrderPayments(orderId);

  if (detail) {
    return applyLocalSyncMetadata(normalizeDetail({
      ...detail,
      customer: customer
        ? {
            ...customer,
            notes: detail.customer?.notes ?? null,
          }
        : detail.customer,
      items: items.length > 0 ? items : detail.items ?? [],
      payments: payments.length > 0 ? payments : detail.payments ?? [],
    }), row);
  }

  return applyLocalSyncMetadata(normalizeDetail({
    ...summary,
    shipping_fee_amount: 0,
    discount_amount: 0,
    notes: null,
    pickup: null,
    delivery: null,
    items,
    payments,
    customer: customer
      ? {
          ...customer,
          notes: null,
        }
      : summary.customer,
    courier: summary.courier
      ? {
          ...summary.courier,
          phone: null,
        }
      : null,
  }), row);
}

async function persistOrderItems(db: Awaited<ReturnType<typeof getLocalDatabase>>, orderId: string, items: OrderItemDetail[], syncedAt: string): Promise<void> {
  await db.runAsync("DELETE FROM order_items WHERE order_id = ?;", [orderId]);

  for (const item of items) {
    await db.runAsync(
      `
        INSERT INTO order_items (
          id,
          order_id,
          service_id,
          service_name_snapshot,
          unit_type_snapshot,
          qty,
          weight_kg,
          unit_price_amount,
          subtotal_amount,
          created_at,
          updated_at,
          payload_json,
          synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        item.id,
        item.order_id,
        item.service_id,
        item.service_name_snapshot,
        item.unit_type_snapshot,
        normalizeNumericText(item.qty),
        normalizeNumericText(item.weight_kg),
        item.unit_price_amount,
        item.subtotal_amount,
        item.created_at || null,
        item.updated_at || null,
        JSON.stringify(item),
        syncedAt,
      ]
    );
  }
}

async function persistOrderPayments(db: Awaited<ReturnType<typeof getLocalDatabase>>, orderId: string, payments: OrderPaymentDetail[], syncedAt: string): Promise<void> {
  await db.runAsync("DELETE FROM order_payments WHERE order_id = ?;", [orderId]);

  for (const payment of payments) {
    await db.runAsync(
      `
        INSERT INTO order_payments (
          id,
          order_id,
          amount,
          method,
          paid_at,
          notes,
          created_at,
          updated_at,
          payload_json,
          synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `,
      [
        payment.id,
        payment.order_id,
        payment.amount,
        payment.method,
        payment.paid_at ?? null,
        payment.notes ?? null,
        payment.created_at || null,
        payment.updated_at || null,
        JSON.stringify(payment),
        syncedAt,
      ]
    );
  }
}

async function writeOrderRecord(
  db: Awaited<ReturnType<typeof getLocalDatabase>>,
  summary: OrderSummary,
  detailPayloadJson: string | null,
  row: LocalOrderRow | null,
  syncedAt: string,
  detailMeta?: Pick<OrderDetail, "shipping_fee_amount" | "discount_amount" | "notes" | "pickup" | "delivery" | "estimated_completion_at" | "estimated_completion_duration_days" | "estimated_completion_duration_hours" | "estimated_completion_is_late">
): Promise<void> {
  const customer = summary.customer ?? (await readCustomerIdentity(summary.customer_id));
  const searchText = buildOrderSearchText(summary, row);

  await db.runAsync(
    `
      INSERT INTO orders (
        id,
        tenant_id,
        outlet_id,
        customer_id,
        customer_name,
        customer_phone_normalized,
        courier_user_id,
        courier_name,
        invoice_no,
        order_code,
        tracking_token,
        tracking_url,
        is_pickup_delivery,
        requires_pickup,
        requires_delivery,
        laundry_status,
        courier_status,
        total_amount,
        paid_amount,
        due_amount,
        shipping_fee_amount,
        discount_amount,
        notes,
        is_cancelled,
        cancelled_at,
        cancelled_by,
        cancelled_reason,
        pickup_json,
        delivery_json,
        estimated_completion_at,
        estimated_completion_duration_days,
        estimated_completion_duration_hours,
        estimated_completion_is_late,
        created_at,
        updated_at,
        search_text,
        summary_payload_json,
        detail_payload_json,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        outlet_id = excluded.outlet_id,
        customer_id = excluded.customer_id,
        customer_name = excluded.customer_name,
        customer_phone_normalized = excluded.customer_phone_normalized,
        courier_user_id = excluded.courier_user_id,
        courier_name = excluded.courier_name,
        invoice_no = excluded.invoice_no,
        order_code = excluded.order_code,
        tracking_token = excluded.tracking_token,
        tracking_url = excluded.tracking_url,
        is_pickup_delivery = excluded.is_pickup_delivery,
        requires_pickup = excluded.requires_pickup,
        requires_delivery = excluded.requires_delivery,
        laundry_status = excluded.laundry_status,
        courier_status = excluded.courier_status,
        total_amount = excluded.total_amount,
        paid_amount = excluded.paid_amount,
        due_amount = excluded.due_amount,
        shipping_fee_amount = COALESCE(excluded.shipping_fee_amount, orders.shipping_fee_amount),
        discount_amount = COALESCE(excluded.discount_amount, orders.discount_amount),
        notes = COALESCE(excluded.notes, orders.notes),
        is_cancelled = excluded.is_cancelled,
        cancelled_at = excluded.cancelled_at,
        cancelled_by = excluded.cancelled_by,
        cancelled_reason = excluded.cancelled_reason,
        pickup_json = COALESCE(excluded.pickup_json, orders.pickup_json),
        delivery_json = COALESCE(excluded.delivery_json, orders.delivery_json),
        estimated_completion_at = COALESCE(excluded.estimated_completion_at, orders.estimated_completion_at),
        estimated_completion_duration_days = COALESCE(excluded.estimated_completion_duration_days, orders.estimated_completion_duration_days),
        estimated_completion_duration_hours = COALESCE(excluded.estimated_completion_duration_hours, orders.estimated_completion_duration_hours),
        estimated_completion_is_late = COALESCE(excluded.estimated_completion_is_late, orders.estimated_completion_is_late),
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        search_text = excluded.search_text,
        summary_payload_json = excluded.summary_payload_json,
        detail_payload_json = COALESCE(excluded.detail_payload_json, orders.detail_payload_json),
        synced_at = excluded.synced_at;
    `,
    [
      summary.id,
      summary.tenant_id,
      summary.outlet_id,
      summary.customer_id,
      customer?.name ?? row?.customer_name ?? null,
      customer?.phone_normalized ?? row?.customer_phone_normalized ?? null,
      summary.courier_user_id ?? null,
      summary.courier?.name ?? row?.courier_name ?? null,
      summary.invoice_no ?? null,
      summary.order_code,
      summary.tracking_token ?? null,
      summary.tracking_url ?? null,
      toDbBoolean(summary.is_pickup_delivery) ?? 0,
      toDbBoolean(summary.requires_pickup),
      toDbBoolean(summary.requires_delivery),
      summary.laundry_status,
      summary.courier_status ?? null,
      summary.total_amount,
      summary.paid_amount,
      summary.due_amount,
      detailMeta?.shipping_fee_amount ?? null,
      detailMeta?.discount_amount ?? null,
      detailMeta?.notes ?? null,
      toDbBoolean(summary.is_cancelled) ?? 0,
      summary.cancelled_at ?? null,
      summary.cancelled_by ?? null,
      summary.cancelled_reason ?? null,
      detailMeta?.pickup ? JSON.stringify(detailMeta.pickup) : null,
      detailMeta?.delivery ? JSON.stringify(detailMeta.delivery) : null,
      detailMeta?.estimated_completion_at ?? null,
      detailMeta?.estimated_completion_duration_days ?? null,
      detailMeta?.estimated_completion_duration_hours ?? null,
      toDbBoolean(detailMeta?.estimated_completion_is_late),
      summary.created_at,
      summary.updated_at,
      searchText,
      JSON.stringify({
        ...summary,
        customer,
      }),
      detailPayloadJson,
      syncedAt,
    ]
  );
}

export async function upsertLocalOrderSummaries(orders: OrderSummary[], syncedAt = nowIsoString()): Promise<void> {
  if (orders.length === 0) {
    return;
  }

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    for (const rawOrder of orders) {
      const summary = normalizeSummary(rawOrder);
      const row = await readLocalOrderRow(summary.id);
      await writeOrderRecord(db, summary, null, row, syncedAt);
    }
  });
}

export async function upsertLocalOrderDetail(order: OrderDetail, syncedAt = nowIsoString()): Promise<void> {
  const detail = normalizeDetail(order);
  const db = await getLocalDatabase();
  const row = await readLocalOrderRow(detail.id);

  if (detail.customer?.id && detail.customer.name) {
    await upsertLocalCustomer(
      {
        id: detail.customer.id,
        tenant_id: detail.tenant_id,
        name: detail.customer.name,
        phone_normalized: detail.customer.phone_normalized,
        notes: detail.customer.notes ?? null,
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        deleted_at: null,
      },
      syncedAt
    );
  }

  await db.withTransactionAsync(async () => {
    await writeOrderRecord(db, normalizeSummary(detail), JSON.stringify(detail), row, syncedAt, {
      shipping_fee_amount: detail.shipping_fee_amount,
      discount_amount: detail.discount_amount,
      notes: detail.notes,
      pickup: detail.pickup,
      delivery: detail.delivery,
      estimated_completion_at: detail.estimated_completion_at,
      estimated_completion_duration_days: detail.estimated_completion_duration_days,
      estimated_completion_duration_hours: detail.estimated_completion_duration_hours,
      estimated_completion_is_late: detail.estimated_completion_is_late,
    });
    await persistOrderItems(db, detail.id, detail.items ?? [], syncedAt);
    await persistOrderPayments(db, detail.id, detail.payments ?? [], syncedAt);
  });
}

export async function deleteLocalOrder(orderId: string): Promise<void> {
  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM order_items WHERE order_id = ?;", [orderId]);
    await db.runAsync("DELETE FROM order_payments WHERE order_id = ?;", [orderId]);
    await db.runAsync("DELETE FROM orders WHERE id = ?;", [orderId]);
  });
}

function buildSummaryFromSyncPayload(payload: Record<string, unknown>, row?: LocalOrderRow | null): OrderSummary {
  const customerId = typeof payload.customer_id === "string" ? payload.customer_id : "";
  const courierUserId = payload.courier_user_id;

  return applyLocalSyncMetadata(normalizeSummary({
    id: String(payload.id ?? ""),
    tenant_id: String(payload.tenant_id ?? ""),
    outlet_id: String(payload.outlet_id ?? ""),
    customer_id: customerId,
    courier_user_id:
      typeof courierUserId === "number" || typeof courierUserId === "string"
        ? String(courierUserId)
        : null,
    invoice_no: typeof payload.invoice_no === "string" ? payload.invoice_no : null,
    order_code: String(payload.order_code ?? ""),
    tracking_token: typeof payload.tracking_token === "string" ? payload.tracking_token : undefined,
    tracking_url: typeof payload.tracking_url === "string" ? payload.tracking_url : undefined,
    is_pickup_delivery: coerceBoolean(payload.is_pickup_delivery),
    requires_pickup: coerceBoolean(payload.requires_pickup),
    requires_delivery: coerceBoolean(payload.requires_delivery),
    laundry_status: String(payload.laundry_status ?? ""),
    courier_status: typeof payload.courier_status === "string" ? payload.courier_status : null,
    total_amount: coerceNumber(payload.total_amount),
    paid_amount: coerceNumber(payload.paid_amount),
    due_amount: coerceNumber(payload.due_amount),
    is_cancelled: coerceBoolean(payload.is_cancelled) || typeof payload.cancelled_at === "string",
    cancelled_at: typeof payload.cancelled_at === "string" ? payload.cancelled_at : null,
    cancelled_by: typeof payload.cancelled_by === "number" ? payload.cancelled_by : null,
    cancelled_reason: typeof payload.cancelled_reason === "string" ? payload.cancelled_reason : null,
    created_at: String(payload.created_at ?? ""),
    updated_at: String(payload.updated_at ?? ""),
    customer: customerId
      ? {
          id: customerId,
          name: row?.customer_name ?? "-",
          phone_normalized: row?.customer_phone_normalized ?? "",
        }
      : undefined,
    courier:
      typeof courierUserId === "number" || typeof courierUserId === "string"
        ? {
            id: String(courierUserId),
            name: row?.courier_name ?? "-",
          }
        : null,
  }), row);
}

function buildItemFromSyncPayload(payload: Record<string, unknown>): OrderItemDetail {
  return {
    id: String(payload.id ?? ""),
    order_id: String(payload.order_id ?? ""),
    service_id: String(payload.service_id ?? ""),
    service_name_snapshot: String(payload.service_name_snapshot ?? ""),
    unit_type_snapshot: String(payload.unit_type_snapshot ?? ""),
    qty: normalizeNumericText(payload.qty as string | number | null | undefined),
    weight_kg: normalizeNumericText(payload.weight_kg as string | number | null | undefined),
    unit_price_amount: coerceNumber(payload.unit_price_amount),
    subtotal_amount: coerceNumber(payload.subtotal_amount),
    created_at: typeof payload.created_at === "string" ? payload.created_at : "",
    updated_at: typeof payload.updated_at === "string" ? payload.updated_at : "",
  };
}

function buildPaymentFromSyncPayload(payload: Record<string, unknown>): OrderPaymentDetail {
  return {
    id: String(payload.id ?? ""),
    order_id: String(payload.order_id ?? ""),
    amount: coerceNumber(payload.amount),
    method: String(payload.method ?? ""),
    paid_at: typeof payload.paid_at === "string" ? payload.paid_at : null,
    notes: typeof payload.notes === "string" ? payload.notes : null,
    created_at: typeof payload.created_at === "string" ? payload.created_at : "",
    updated_at: typeof payload.updated_at === "string" ? payload.updated_at : "",
  };
}

async function upsertOrderItem(item: OrderItemDetail, syncedAt: string): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `
      INSERT INTO order_items (
        id,
        order_id,
        service_id,
        service_name_snapshot,
        unit_type_snapshot,
        qty,
        weight_kg,
        unit_price_amount,
        subtotal_amount,
        created_at,
        updated_at,
        payload_json,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        order_id = excluded.order_id,
        service_id = excluded.service_id,
        service_name_snapshot = excluded.service_name_snapshot,
        unit_type_snapshot = excluded.unit_type_snapshot,
        qty = excluded.qty,
        weight_kg = excluded.weight_kg,
        unit_price_amount = excluded.unit_price_amount,
        subtotal_amount = excluded.subtotal_amount,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json,
        synced_at = excluded.synced_at;
    `,
    [
      item.id,
      item.order_id,
      item.service_id,
      item.service_name_snapshot,
      item.unit_type_snapshot,
      normalizeNumericText(item.qty),
      normalizeNumericText(item.weight_kg),
      item.unit_price_amount,
      item.subtotal_amount,
      item.created_at || null,
      item.updated_at || null,
      JSON.stringify(item),
      syncedAt,
    ]
  );
}

async function upsertOrderPayment(payment: OrderPaymentDetail, syncedAt: string): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `
      INSERT INTO order_payments (
        id,
        order_id,
        amount,
        method,
        paid_at,
        notes,
        created_at,
        updated_at,
        payload_json,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        order_id = excluded.order_id,
        amount = excluded.amount,
        method = excluded.method,
        paid_at = excluded.paid_at,
        notes = excluded.notes,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        payload_json = excluded.payload_json,
        synced_at = excluded.synced_at;
    `,
    [
      payment.id,
      payment.order_id,
      payment.amount,
      payment.method,
      payment.paid_at ?? null,
      payment.notes ?? null,
      payment.created_at || null,
      payment.updated_at || null,
      JSON.stringify(payment),
      syncedAt,
    ]
  );
}

export async function applyLocalSyncPullChanges(changes: LocalSyncPullChange[]): Promise<void> {
  for (const change of changes) {
    const entityType = change.entity_type.trim().toLowerCase();
    const syncedAt = change.updated_at || nowIsoString();

    if (change.op === "delete") {
      if (entityType === "order") {
        await deleteLocalOrder(change.entity_id);
      }
      continue;
    }

    if (!change.data) {
      continue;
    }

    if (entityType === "customer") {
      const customer = change.data as unknown as Customer;
      if (customer.id) {
        await upsertLocalCustomer(customer, syncedAt);
      }
      continue;
    }

    if (entityType === "order") {
      const row = await readLocalOrderRow(change.entity_id);
      await upsertLocalOrderSummaries([buildSummaryFromSyncPayload(change.data, row)], syncedAt);
      continue;
    }

    if (entityType === "order_item") {
      await upsertOrderItem(buildItemFromSyncPayload(change.data), syncedAt);
      continue;
    }

    if (entityType === "payment") {
      await upsertOrderPayment(buildPaymentFromSyncPayload(change.data), syncedAt);
    }
  }
}
