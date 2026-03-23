import { getAppMetaString, setAppMetaString } from "../localdb/appMetaStorage";
import { getLocalDatabase } from "../localdb/database";
import { nowIsoString, safeJsonParse } from "./repositoryShared";
import type { BillingEntriesFilters, BillingEntriesPayload, BillingEntriesSummary, BillingEntry, BillingEntryType } from "../../types/billing";

interface BillingEntriesQuery {
  outletId: string;
  type?: BillingEntryType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface BillingEntriesSnapshotRecord {
  summary: BillingEntriesSummary;
  synced_at: string;
}

interface LocalBillingEntryRow {
  payload_json: string;
}

const BILLING_SNAPSHOT_META_PREFIX = "billing_entries_snapshot:";

function normalizeBillingEntry(entry: BillingEntry): BillingEntry {
  return {
    ...entry,
    notes: entry.notes ?? null,
    created_by: entry.created_by ?? null,
    created_by_name: entry.created_by_name ?? null,
    source_channel: entry.source_channel || "mobile",
    created_at: entry.created_at ?? null,
    updated_at: entry.updated_at ?? null,
  };
}

function normalizeQuery(params: BillingEntriesQuery): Required<Pick<BillingEntriesFilters, "outlet_id" | "limit">> & Omit<BillingEntriesFilters, "outlet_id" | "limit"> {
  return {
    outlet_id: params.outletId.trim(),
    type: params.type ?? null,
    start_date: params.startDate?.trim() || null,
    end_date: params.endDate?.trim() || null,
    limit: Math.min(Math.max(params.limit ?? 50, 1), 100),
  };
}

function buildSnapshotKey(filters: Omit<BillingEntriesFilters, "limit">): string {
  return [
    BILLING_SNAPSHOT_META_PREFIX,
    filters.outlet_id,
    filters.type ?? "all",
    filters.start_date ?? "all",
    filters.end_date ?? "all",
  ].join(":");
}

function computeSummary(entries: BillingEntry[]): BillingEntriesSummary {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalAdjustment = 0;

  for (const entry of entries) {
    if (entry.type === "income") {
      totalIncome += entry.amount;
      continue;
    }

    if (entry.type === "expense") {
      totalExpense += entry.amount;
      continue;
    }

    totalAdjustment += entry.amount;
  }

  return {
    total_income: totalIncome,
    total_expense: totalExpense,
    total_adjustment: totalAdjustment,
    net_amount: totalIncome - totalExpense + totalAdjustment,
    entries_count: entries.length,
  };
}

async function readLocalEntries(filters: ReturnType<typeof normalizeQuery>): Promise<BillingEntry[]> {
  const db = await getLocalDatabase();
  const clauses = ["outlet_id = ?"];
  const args: Array<string> = [filters.outlet_id];

  if (filters.type) {
    clauses.push("type = ?");
    args.push(filters.type);
  }

  if (filters.start_date) {
    clauses.push("entry_date >= ?");
    args.push(filters.start_date);
  }

  if (filters.end_date) {
    clauses.push("entry_date <= ?");
    args.push(filters.end_date);
  }

  const rows = await db.getAllAsync<LocalBillingEntryRow>(
    `
      SELECT payload_json
      FROM billing_entries
      WHERE ${clauses.join(" AND ")}
      ORDER BY entry_date DESC, COALESCE(updated_at, created_at) DESC, id DESC;
    `,
    args
  );

  return rows.map((row) => normalizeBillingEntry(safeJsonParse<BillingEntry>(row.payload_json, {} as BillingEntry)));
}

async function readSnapshot(filters: ReturnType<typeof normalizeQuery>): Promise<BillingEntriesSnapshotRecord | null> {
  const raw = await getAppMetaString(
    buildSnapshotKey({
      outlet_id: filters.outlet_id,
      type: filters.type,
      start_date: filters.start_date,
      end_date: filters.end_date,
    })
  );

  return safeJsonParse<BillingEntriesSnapshotRecord | null>(raw, null);
}

export async function readLocalBillingEntries(params: BillingEntriesQuery): Promise<BillingEntriesPayload | null> {
  const filters = normalizeQuery(params);
  const [localEntries, snapshot] = await Promise.all([readLocalEntries(filters), readSnapshot(filters)]);

  if (localEntries.length === 0 && !snapshot) {
    return null;
  }

  return {
    data: localEntries.slice(0, filters.limit),
    summary: snapshot?.summary ?? computeSummary(localEntries),
    filters,
  };
}

export async function upsertLocalBillingEntries(entries: BillingEntry[], syncedAt = nowIsoString()): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const db = await getLocalDatabase();

  await db.withTransactionAsync(async () => {
    for (const rawEntry of entries) {
      const entry = normalizeBillingEntry(rawEntry);
      await db.runAsync(
        `
          INSERT INTO billing_entries (
            id,
            tenant_id,
            outlet_id,
            entry_date,
            type,
            amount,
            category,
            notes,
            created_by,
            created_by_name,
            source_channel,
            created_at,
            updated_at,
            payload_json,
            synced_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            outlet_id = excluded.outlet_id,
            entry_date = excluded.entry_date,
            type = excluded.type,
            amount = excluded.amount,
            category = excluded.category,
            notes = excluded.notes,
            created_by = excluded.created_by,
            created_by_name = excluded.created_by_name,
            source_channel = excluded.source_channel,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            payload_json = excluded.payload_json,
            synced_at = excluded.synced_at;
        `,
        [
          entry.id,
          entry.tenant_id,
          entry.outlet_id,
          entry.entry_date,
          entry.type,
          entry.amount,
          entry.category,
          entry.notes,
          entry.created_by,
          entry.created_by_name,
          entry.source_channel,
          entry.created_at,
          entry.updated_at,
          JSON.stringify(entry),
          syncedAt,
        ]
      );
    }
  });
}

export async function storeBillingEntriesSnapshot(params: BillingEntriesQuery, payload: BillingEntriesPayload, syncedAt = nowIsoString()): Promise<void> {
  const filters = normalizeQuery(params);

  await setAppMetaString(
    buildSnapshotKey({
      outlet_id: filters.outlet_id,
      type: filters.type,
      start_date: filters.start_date,
      end_date: filters.end_date,
    }),
    JSON.stringify({
      summary: payload.summary,
      synced_at: syncedAt,
    } satisfies BillingEntriesSnapshotRecord)
  );
}
