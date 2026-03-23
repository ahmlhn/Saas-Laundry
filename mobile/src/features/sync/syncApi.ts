import { httpClient } from "../../lib/httpClient";
import { getOrCreateDeviceId } from "./deviceIdentity";
import { readLastKnownCursorForOutlet, writeLastKnownCursorForOutlet, writeLastSuccessfulSyncAt } from "./syncStateStorage";
import type { LocalSyncPullChange } from "../repositories/ordersRepository";

export interface SyncEntityRef {
  entity_type: string;
  entity_id: string;
}

export interface SyncPushMutation {
  mutation_id: string;
  seq: number;
  type: string;
  outlet_id?: string | null;
  entity?: SyncEntityRef | null;
  client_time?: string | null;
  payload?: Record<string, unknown>;
}

export interface SyncPushAck {
  mutation_id: string;
  status: "applied" | "duplicate" | string;
  server_cursor: number | string | null;
  entity_refs: SyncEntityRef[];
  effects?: Record<string, unknown>;
}

export interface SyncPushRejected {
  mutation_id: string;
  status: "rejected" | string;
  reason_code: string;
  message: string;
  current_server_state?: Record<string, unknown>;
}

export interface SyncPushResponse {
  server_time: string;
  ack: SyncPushAck[];
  rejected: SyncPushRejected[];
  quota?: {
    plan: string | null;
    period: string;
    orders_limit: number | null;
    orders_used: number;
    orders_remaining: number | null;
    can_create_order: boolean;
  };
}

export interface InvoiceRangeClaimedRange {
  lease_id: string;
  outlet_id: string;
  date: string;
  prefix: string;
  from: number;
  to: number;
  expires_at: string;
}

interface InvoiceRangeClaimResponse {
  server_time: string;
  ranges: InvoiceRangeClaimedRange[];
}

interface SyncPullResponse {
  server_time: string;
  next_cursor: number | string | null;
  has_more: boolean;
  changes: LocalSyncPullChange[];
  quota?: {
    plan: string | null;
    period: string;
    orders_limit: number | null;
    orders_used: number;
    orders_remaining: number | null;
    can_create_order: boolean;
  };
}

interface PullChangesParams {
  outletId: string;
  limit?: number;
}

export async function pushSyncMutations(params: { mutations: SyncPushMutation[]; lastKnownServerCursor?: string | null }): Promise<SyncPushResponse> {
  const deviceId = await getOrCreateDeviceId();
  const response = await httpClient.post<SyncPushResponse>("/sync/push", {
    device_id: deviceId,
    last_known_server_cursor: params.lastKnownServerCursor ? Number(params.lastKnownServerCursor) : null,
    mutations: params.mutations,
  });

  return response.data;
}

export async function claimInvoiceRanges(params: {
  outletId: string;
  days: Array<{ date: string; count: number }>;
}): Promise<InvoiceRangeClaimResponse> {
  const deviceId = await getOrCreateDeviceId();
  const response = await httpClient.post<InvoiceRangeClaimResponse>("/invoices/range/claim", {
    device_id: deviceId,
    outlet_id: params.outletId,
    days: params.days,
  });

  return response.data;
}

export async function pullSyncChangesPage(params: PullChangesParams & { cursor?: string | null }): Promise<SyncPullResponse> {
  const deviceId = await getOrCreateDeviceId();
  const response = await httpClient.post<SyncPullResponse>("/sync/pull", {
    device_id: deviceId,
    cursor: params.cursor ? Number(params.cursor) : null,
    scope: {
      mode: "selected_outlet",
      outlet_id: params.outletId,
    },
    limit: params.limit ?? 200,
  });

  return response.data;
}

export async function pullAllSyncChangesForOutlet(params: PullChangesParams): Promise<SyncPullResponse> {
  let cursor = await readLastKnownCursorForOutlet(params.outletId);
  let hasMore = true;
  let pages = 0;
  let latestResponse: SyncPullResponse = {
    server_time: new Date().toISOString(),
    next_cursor: cursor,
    has_more: false,
    changes: [],
  };
  const allChanges: LocalSyncPullChange[] = [];

  while (hasMore && pages < 20) {
    pages += 1;
    const response = await pullSyncChangesPage({
      outletId: params.outletId,
      limit: params.limit,
      cursor,
    });

    latestResponse = response;
    allChanges.push(...response.changes);

    const nextCursor =
      response.next_cursor === null || response.next_cursor === undefined
        ? cursor
        : String(response.next_cursor);

    if (nextCursor && nextCursor !== cursor) {
      await writeLastKnownCursorForOutlet(params.outletId, nextCursor);
      cursor = nextCursor;
    }

    await writeLastSuccessfulSyncAt(response.server_time);
    hasMore = response.has_more === true && response.changes.length > 0;
  }

  return {
    ...latestResponse,
    changes: allChanges,
    has_more: hasMore,
  };
}
