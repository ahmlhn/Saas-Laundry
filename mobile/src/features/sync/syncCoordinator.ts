import { toDateToken } from "../../lib/dateTime";
import { httpClient } from "../../lib/httpClient";
import type { Customer } from "../../types/customer";
import type { OrderDetail } from "../../types/order";
import { refreshConnectivitySnapshot, getConnectivitySnapshot } from "../connectivity/connectivityService";
import { readLocalCustomerById, upsertLocalCustomer } from "../repositories/customersRepository";
import { applyLocalSyncPullChanges, readLocalOrderDetail, upsertLocalOrderDetail } from "../repositories/ordersRepository";
import { nowIsoString } from "../repositories/repositoryShared";
import { claimInvoiceRanges, pullAllSyncChangesForOutlet, pushSyncMutations, type SyncPushAck, type SyncPushRejected } from "./syncApi";
import { describeSyncReason } from "./syncConflictMapper";
import { getOutboxMutation, listPendingOutboxMutations, markOutboxMutationApplied, markOutboxMutationAttempted, markOutboxMutationRejected, refreshOutboxTelemetrySnapshot, type OutboxMutationRecord } from "./outboxRepository";
import { getInvoiceLeaseAvailableCount, upsertInvoiceLeaseRanges } from "./invoiceLeaseRepository";
import { writeLastKnownCursor, writeLastSuccessfulSyncAt } from "./syncStateStorage";

interface OrderDetailResponse {
  data: OrderDetail;
}

export interface SyncExecutionResult {
  pushedCount: number;
  pulledCount: number;
  claimedRangeCount: number;
  ack: SyncPushAck[];
  rejected: SyncPushRejected[];
  pullErrorMessage: string | null;
}

const INVOICE_LEASE_TARGET_COUNT = 60;
const INVOICE_LEASE_MINIMUM_BUFFER = 20;

let activeSyncPromise: Promise<SyncExecutionResult> | null = null;

function buildNextDateToken(offsetDays: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return toDateToken(date);
}

async function refreshOrderDetailFromServer(orderId: string): Promise<void> {
  const response = await httpClient.get<OrderDetailResponse>(`/orders/${orderId}`);
  await upsertLocalOrderDetail(response.data.data);
}

async function applyAckEffects(mutation: OutboxMutationRecord, ack: SyncPushAck): Promise<void> {
  const effects = ack.effects ?? {};
  const orderRef = ack.entity_refs.find((ref) => ref.entity_type === "order");
  const orderId = orderRef?.entity_id ?? mutation.entity_id ?? null;

  if (!orderId) {
    return;
  }

  const detail = await readLocalOrderDetail(orderId);
  if (!detail) {
    return;
  }

  let nextDetail = detail;
  let changed = false;
  const invoiceNoAssigned = typeof effects.invoice_no_assigned === "string" ? effects.invoice_no_assigned.trim() : "";
  if (invoiceNoAssigned && nextDetail.invoice_no !== invoiceNoAssigned) {
    nextDetail = {
      ...nextDetail,
      invoice_no: invoiceNoAssigned,
    };
    changed = true;
  }

  const idMap = effects.id_map as Record<string, unknown> | undefined;
  const customerClientId = typeof idMap?.customer_client_id === "string" ? idMap.customer_client_id : null;
  const customerServerId = typeof idMap?.customer_server_id === "string" ? idMap.customer_server_id : null;

  if (customerClientId && customerServerId && nextDetail.customer_id === customerClientId) {
    const localCustomer = await readLocalCustomerById(customerClientId);
    if (localCustomer) {
      const migratedCustomer: Customer = {
        ...localCustomer,
        id: customerServerId,
        updated_at: nowIsoString(),
      };
      await upsertLocalCustomer(migratedCustomer);
    }

    nextDetail = {
      ...nextDetail,
      customer_id: customerServerId,
      customer: nextDetail.customer
        ? {
            ...nextDetail.customer,
            id: customerServerId,
          }
        : nextDetail.customer,
    };
    changed = true;
  }

  if (changed) {
    await upsertLocalOrderDetail(nextDetail);
  }
}

async function applyPushResults(pendingMutations: OutboxMutationRecord[], ack: SyncPushAck[], rejected: SyncPushRejected[]): Promise<string[]> {
  const latestAppliedCursor = ack.reduce<string | null>((latest, item) => {
    if (item.server_cursor === null || item.server_cursor === undefined) {
      return latest;
    }

    const nextCursor = String(item.server_cursor);
    if (!latest) {
      return nextCursor;
    }

    return Number(nextCursor) > Number(latest) ? nextCursor : latest;
  }, null);

  const mutationById = new Map(pendingMutations.map((item) => [item.mutation_id, item]));
  const rejectedOrderIds = new Set<string>();

  for (const item of ack) {
    const mutation = mutationById.get(item.mutation_id);
    await markOutboxMutationApplied(item.mutation_id, item.server_cursor === null || item.server_cursor === undefined ? null : String(item.server_cursor));
    if (mutation) {
      await applyAckEffects(mutation, item);
    }
  }

  for (const item of rejected) {
    await markOutboxMutationRejected(item.mutation_id, item.reason_code ?? null, item.message ?? null);
    const mutation = mutationById.get(item.mutation_id);
    if (mutation?.type !== "ORDER_CREATE" && mutation?.entity_id) {
      rejectedOrderIds.add(mutation.entity_id);
      continue;
    }

    const currentServerOrderId =
      typeof item.current_server_state?.entity_id === "string" ? item.current_server_state.entity_id : null;
    if (currentServerOrderId) {
      rejectedOrderIds.add(currentServerOrderId);
    }
  }

  if (latestAppliedCursor) {
    await writeLastKnownCursor(latestAppliedCursor);
  }

  await refreshOutboxTelemetrySnapshot();
  return [...rejectedOrderIds];
}

async function ensureInvoiceLeaseCoverage(outletId: string): Promise<number> {
  const requestedDays: Array<{ date: string; count: number }> = [];

  for (const offsetDays of [0, 1]) {
    const dateToken = buildNextDateToken(offsetDays);
    const availableCount = await getInvoiceLeaseAvailableCount(outletId, dateToken);

    if (availableCount >= INVOICE_LEASE_MINIMUM_BUFFER) {
      continue;
    }

    requestedDays.push({
      date: dateToken,
      count: Math.max(INVOICE_LEASE_TARGET_COUNT - availableCount, 1),
    });
  }

  if (requestedDays.length === 0) {
    return 0;
  }

  const response = await claimInvoiceRanges({
    outletId,
    days: requestedDays,
  });
  await upsertInvoiceLeaseRanges(response.ranges);
  return response.ranges.length;
}

async function runSync(options: { selectedOutletId?: string | null; limit?: number } = {}): Promise<SyncExecutionResult> {
  const currentConnectivity = getConnectivitySnapshot();
  const resolvedConnectivity = currentConnectivity.hasResolvedState ? currentConnectivity : await refreshConnectivitySnapshot();

  if (!resolvedConnectivity.isOnline) {
    throw new Error("Perangkat sedang offline. Sinkronisasi ditunda.");
  }

  const result: SyncExecutionResult = {
    pushedCount: 0,
    pulledCount: 0,
    claimedRangeCount: 0,
    ack: [],
    rejected: [],
    pullErrorMessage: null,
  };

  const pendingMutations = await listPendingOutboxMutations(options.limit ?? 50);
  if (pendingMutations.length > 0) {
    const attemptedAt = nowIsoString();
    await Promise.all(pendingMutations.map((mutation) => markOutboxMutationAttempted(mutation.mutation_id, attemptedAt)));

    const pushResponse = await pushSyncMutations({
      mutations: pendingMutations.map((mutation) => ({
        mutation_id: mutation.mutation_id,
        seq: mutation.seq,
        type: mutation.type,
        outlet_id: mutation.outlet_id,
        entity:
          mutation.entity_type && mutation.entity_id
            ? {
                entity_type: mutation.entity_type,
                entity_id: mutation.entity_id,
              }
            : null,
        client_time: mutation.client_time,
        payload: mutation.payload,
      })),
      lastKnownServerCursor: null,
    });

    result.ack = pushResponse.ack ?? [];
    result.rejected = pushResponse.rejected ?? [];
    result.pushedCount = result.ack.length + result.rejected.length;

    const rejectedOrderIds = await applyPushResults(pendingMutations, result.ack, result.rejected);
    await Promise.all(rejectedOrderIds.map((orderId) => refreshOrderDetailFromServer(orderId).catch(() => undefined)));
  }

  if (options.selectedOutletId) {
    result.claimedRangeCount = await ensureInvoiceLeaseCoverage(options.selectedOutletId).catch(() => 0);

    try {
      const pullResponse = await pullAllSyncChangesForOutlet({
        outletId: options.selectedOutletId,
        limit: 200,
      });

      if (pullResponse.changes.length > 0) {
        await applyLocalSyncPullChanges(pullResponse.changes);
      }

      result.pulledCount = pullResponse.changes.length;
      await writeLastSuccessfulSyncAt(pullResponse.server_time);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menarik perubahan terbaru.";
      if (result.pushedCount === 0 && result.rejected.length === 0) {
        throw error instanceof Error ? error : new Error(message);
      }

      result.pullErrorMessage = message;
    }
  }

  await refreshOutboxTelemetrySnapshot();
  return result;
}

export async function syncPendingMutationsNow(options: { selectedOutletId?: string | null; limit?: number } = {}): Promise<SyncExecutionResult> {
  if (!activeSyncPromise) {
    activeSyncPromise = runSync(options).finally(() => {
      activeSyncPromise = null;
    });
  }

  return activeSyncPromise;
}

export async function syncPendingMutationsIfOnline(options: { selectedOutletId?: string | null; limit?: number } = {}): Promise<SyncExecutionResult | null> {
  const currentConnectivity = getConnectivitySnapshot();
  const resolvedConnectivity = currentConnectivity.hasResolvedState ? currentConnectivity : await refreshConnectivitySnapshot();

  if (!resolvedConnectivity.isOnline) {
    return null;
  }

  return syncPendingMutationsNow(options);
}

export async function ensureOrderMutationAppliedOrThrow(
  mutationId: string,
  defaultMessage: string
): Promise<void> {
  const mutation = await getOutboxMutation(mutationId);
  if (!mutation || mutation.status !== "rejected") {
    return;
  }

  throw new Error(describeSyncReason(mutation.reason_code, mutation.message || defaultMessage));
}
