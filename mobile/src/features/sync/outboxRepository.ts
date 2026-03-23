import { getAppMetaString, setAppMetaString } from "../localdb/appMetaStorage";
import { getLocalDatabase } from "../localdb/database";
import { createUuid } from "../../lib/randomId";
import { nowIsoString, safeJsonParse } from "../repositories/repositoryShared";
import { writeRejectedCount, writeUnsyncedCount } from "./syncStateStorage";

const OUTBOX_SEQ_KEY = "sync.outbox.seq";

export type OutboxMutationStatus = "pending" | "applied" | "rejected";

export interface OutboxMutationRecord<TPayload = Record<string, unknown>> {
  mutation_id: string;
  seq: number;
  type: string;
  outlet_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  client_time: string;
  payload: TPayload;
  status: OutboxMutationStatus;
  reason_code: string | null;
  message: string | null;
  server_cursor: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueOutboxMutationInput<TPayload = Record<string, unknown>> {
  mutation_id: string;
  type: string;
  outlet_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  client_time?: string;
  payload?: TPayload;
}

interface OutboxMutationRow {
  mutation_id: string;
  seq: number;
  type: string;
  outlet_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  client_time: string;
  payload_json: string;
  status: OutboxMutationStatus;
  reason_code: string | null;
  message: string | null;
  server_cursor: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  total: number;
}

function mapRow<TPayload>(row: OutboxMutationRow): OutboxMutationRecord<TPayload> {
  return {
    mutation_id: row.mutation_id,
    seq: Number(row.seq),
    type: row.type,
    outlet_id: row.outlet_id ?? null,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    client_time: row.client_time,
    payload: safeJsonParse<TPayload>(row.payload_json, {} as TPayload),
    status: row.status,
    reason_code: row.reason_code ?? null,
    message: row.message ?? null,
    server_cursor: row.server_cursor ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
    last_attempt_at: row.last_attempt_at ?? null,
    synced_at: row.synced_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function readNextOutboxSequence(): Promise<number> {
  const raw = await getAppMetaString(OUTBOX_SEQ_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 1;
  }

  return Math.floor(parsed) + 1;
}

async function writeNextOutboxSequence(value: number): Promise<void> {
  await setAppMetaString(OUTBOX_SEQ_KEY, String(Math.max(1, Math.floor(value))));
}

export async function enqueueOutboxMutation<TPayload = Record<string, unknown>>(
  input: EnqueueOutboxMutationInput<TPayload>
): Promise<OutboxMutationRecord<TPayload>> {
  const db = await getLocalDatabase();
  const createdAt = nowIsoString();
  const seq = await readNextOutboxSequence();

  await db.runAsync(
    `
      INSERT INTO outbox_mutations (
        mutation_id,
        seq,
        type,
        outlet_id,
        entity_type,
        entity_id,
        client_time,
        payload_json,
        status,
        reason_code,
        message,
        server_cursor,
        attempt_count,
        last_attempt_at,
        synced_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, 0, NULL, NULL, ?, ?);
    `,
    [
      input.mutation_id,
      seq,
      input.type,
      input.outlet_id ?? null,
      input.entity_type ?? null,
      input.entity_id ?? null,
      input.client_time ?? createdAt,
      JSON.stringify(input.payload ?? {}),
      createdAt,
      createdAt,
    ]
  );

  await writeNextOutboxSequence(seq);
  await refreshOutboxTelemetrySnapshot();

  return {
    mutation_id: input.mutation_id,
    seq,
    type: input.type,
    outlet_id: input.outlet_id ?? null,
    entity_type: input.entity_type ?? null,
    entity_id: input.entity_id ?? null,
    client_time: input.client_time ?? createdAt,
    payload: (input.payload ?? {}) as TPayload,
    status: "pending",
    reason_code: null,
    message: null,
    server_cursor: null,
    attempt_count: 0,
    last_attempt_at: null,
    synced_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export async function getOutboxMutation<TPayload = Record<string, unknown>>(mutationId: string): Promise<OutboxMutationRecord<TPayload> | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<OutboxMutationRow>(
    "SELECT * FROM outbox_mutations WHERE mutation_id = ? LIMIT 1;",
    [mutationId]
  );

  return row ? mapRow<TPayload>(row) : null;
}

export async function listPendingOutboxMutations(limit = 50): Promise<OutboxMutationRecord[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<OutboxMutationRow>(
    `
      SELECT *
      FROM outbox_mutations
      WHERE status = 'pending'
      ORDER BY seq ASC
      LIMIT ?;
    `,
    [Math.max(limit, 1)]
  );

  return rows.map((row) => mapRow(row));
}

export async function listVisibleOutboxMutations(limit = 20): Promise<OutboxMutationRecord[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<OutboxMutationRow>(
    `
      SELECT *
      FROM outbox_mutations
      WHERE status IN ('pending', 'rejected')
      ORDER BY
        CASE status WHEN 'rejected' THEN 0 ELSE 1 END,
        seq DESC
      LIMIT ?;
    `,
    [Math.max(limit, 1)]
  );

  return rows.map((row) => mapRow(row));
}

export async function retryRejectedOutboxMutation<TPayload = Record<string, unknown>>(
  mutationId: string
): Promise<OutboxMutationRecord<TPayload> | null> {
  const db = await getLocalDatabase();
  const existingRow = await db.getFirstAsync<OutboxMutationRow>(
    "SELECT * FROM outbox_mutations WHERE mutation_id = ? AND status = 'rejected' LIMIT 1;",
    [mutationId]
  );

  if (!existingRow) {
    return null;
  }

  const createdAt = nowIsoString();
  const nextMutationId = createUuid();
  const nextSeq = await readNextOutboxSequence();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `
        INSERT INTO outbox_mutations (
          mutation_id,
          seq,
          type,
          outlet_id,
          entity_type,
          entity_id,
          client_time,
          payload_json,
          status,
          reason_code,
          message,
          server_cursor,
          attempt_count,
          last_attempt_at,
          synced_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, 0, NULL, NULL, ?, ?);
      `,
      [
        nextMutationId,
        nextSeq,
        existingRow.type,
        existingRow.outlet_id ?? null,
        existingRow.entity_type ?? null,
        existingRow.entity_id ?? null,
        existingRow.client_time,
        existingRow.payload_json,
        createdAt,
        createdAt,
      ]
    );

    await db.runAsync("DELETE FROM outbox_mutations WHERE mutation_id = ?;", [mutationId]);
  });

  await writeNextOutboxSequence(nextSeq);
  await refreshOutboxTelemetrySnapshot();

  return mapRow<TPayload>({
    ...existingRow,
    mutation_id: nextMutationId,
    seq: nextSeq,
    status: "pending",
    reason_code: null,
    message: null,
    server_cursor: null,
    attempt_count: 0,
    last_attempt_at: null,
    synced_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  });
}

export async function retryRejectedOutboxMutations(limit = 20): Promise<OutboxMutationRecord[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<OutboxMutationRow>(
    `
      SELECT *
      FROM outbox_mutations
      WHERE status = 'rejected'
      ORDER BY seq ASC
      LIMIT ?;
    `,
    [Math.max(limit, 1)]
  );

  const retried: OutboxMutationRecord[] = [];

  for (const row of rows) {
    const next = await retryRejectedOutboxMutation(row.mutation_id);
    if (next) {
      retried.push(next);
    }
  }

  return retried;
}

export async function markOutboxMutationAttempted(mutationId: string, attemptedAt = nowIsoString()): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `
      UPDATE outbox_mutations
      SET
        attempt_count = attempt_count + 1,
        last_attempt_at = ?,
        updated_at = ?
      WHERE mutation_id = ?;
    `,
    [attemptedAt, attemptedAt, mutationId]
  );
}

export async function markOutboxMutationApplied(mutationId: string, serverCursor: string | null, syncedAt = nowIsoString()): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `
      UPDATE outbox_mutations
      SET
        status = 'applied',
        reason_code = NULL,
        message = NULL,
        server_cursor = ?,
        synced_at = ?,
        updated_at = ?
      WHERE mutation_id = ?;
    `,
    [serverCursor, syncedAt, syncedAt, mutationId]
  );

  await refreshOutboxTelemetrySnapshot();
}

export async function markOutboxMutationRejected(
  mutationId: string,
  reasonCode: string | null,
  message: string | null,
  updatedAt = nowIsoString()
): Promise<void> {
  const db = await getLocalDatabase();
  await db.runAsync(
    `
      UPDATE outbox_mutations
      SET
        status = 'rejected',
        reason_code = ?,
        message = ?,
        updated_at = ?
      WHERE mutation_id = ?;
    `,
    [reasonCode, message, updatedAt, mutationId]
  );

  await refreshOutboxTelemetrySnapshot();
}

export async function getOutboxTelemetry(): Promise<{ pendingCount: number; rejectedCount: number; unsyncedCount: number }> {
  const db = await getLocalDatabase();
  const [pendingRow, rejectedRow] = await Promise.all([
    db.getFirstAsync<CountRow>("SELECT COUNT(*) as total FROM outbox_mutations WHERE status = 'pending';"),
    db.getFirstAsync<CountRow>("SELECT COUNT(*) as total FROM outbox_mutations WHERE status = 'rejected';"),
  ]);

  const pendingCount = Math.max(Number(pendingRow?.total ?? 0), 0);
  const rejectedCount = Math.max(Number(rejectedRow?.total ?? 0), 0);

  return {
    pendingCount,
    rejectedCount,
    unsyncedCount: pendingCount + rejectedCount,
  };
}

export async function refreshOutboxTelemetrySnapshot(): Promise<{ pendingCount: number; rejectedCount: number; unsyncedCount: number }> {
  const telemetry = await getOutboxTelemetry();
  await Promise.all([
    writeUnsyncedCount(telemetry.unsyncedCount),
    writeRejectedCount(telemetry.rejectedCount),
  ]);

  return telemetry;
}
