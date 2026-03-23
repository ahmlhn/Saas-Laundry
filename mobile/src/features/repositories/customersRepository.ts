import { getLocalDatabase } from "../localdb/database";
import { nowIsoString, normalizeSearchText } from "./repositoryShared";
import type { Customer } from "../../types/customer";

interface LocalCustomersQueryParams {
  query?: string;
  limit?: number;
  page?: number;
  includeDeleted?: boolean;
}

export interface LocalCustomerListPage {
  items: Customer[];
  page: number;
  hasMore: boolean;
  total: number | null;
}

interface LocalCustomerRow {
  payload_json: string;
}

function normalizeCustomer(customer: Customer): Customer {
  return {
    ...customer,
    deleted_at: customer.deleted_at ?? null,
    orders_count: customer.orders_count ?? undefined,
  };
}

function buildCustomersWhereClause(params: LocalCustomersQueryParams): {
  whereSql: string;
  args: Array<string | number>;
} {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  const keyword = params.query?.trim().toLowerCase() ?? "";

  if (!params.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }

  if (keyword.length > 0) {
    clauses.push("search_text LIKE ?");
    args.push(`%${keyword}%`);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}

export async function hasAnyLocalCustomers(params: { includeDeleted?: boolean } = {}): Promise<boolean> {
  const db = await getLocalDatabase();
  const where = params.includeDeleted ? "" : "WHERE deleted_at IS NULL";
  const row = await db.getFirstAsync<{ total: number }>(`SELECT COUNT(*) as total FROM customers ${where};`);
  return Number(row?.total ?? 0) > 0;
}

export async function readLocalCustomersPage(params: LocalCustomersQueryParams = {}): Promise<LocalCustomerListPage> {
  const db = await getLocalDatabase();
  const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const { whereSql, args } = buildCustomersWhereClause(params);

  const rows = await db.getAllAsync<LocalCustomerRow>(
    `
      SELECT payload_json
      FROM customers
      ${whereSql}
      ORDER BY updated_at DESC, name COLLATE NOCASE ASC
      LIMIT ? OFFSET ?;
    `,
    [...args, limit, offset]
  );

  const totalRow = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) as total FROM customers ${whereSql};`,
    args
  );
  const total = Number(totalRow?.total ?? 0);

  return {
    items: rows.map((row) => normalizeCustomer(JSON.parse(row.payload_json) as Customer)),
    page,
    hasMore: offset + rows.length < total,
    total,
  };
}

export async function readLocalCustomers(params: Omit<LocalCustomersQueryParams, "page"> = {}): Promise<Customer[]> {
  const limit = params.limit ?? 100;
  const firstPage = await readLocalCustomersPage({
    ...params,
    limit,
    page: 1,
  });

  if (!firstPage.hasMore) {
    return firstPage.items;
  }

  const items = [...firstPage.items];
  let nextPage = 2;
  let hasMore = true;

  while (hasMore) {
    const page = await readLocalCustomersPage({
      ...params,
      limit,
      page: nextPage,
    });
    items.push(...page.items);
    hasMore = page.hasMore;
    nextPage += 1;
  }

  return items;
}

export async function readLocalCustomerById(customerId: string): Promise<Customer | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<LocalCustomerRow>(
    "SELECT payload_json FROM customers WHERE id = ? LIMIT 1;",
    [customerId]
  );

  if (!row?.payload_json) {
    return null;
  }

  return normalizeCustomer(JSON.parse(row.payload_json) as Customer);
}

async function writeCustomerSnapshot(customer: Customer, syncedAt: string): Promise<void> {
  const db = await getLocalDatabase();
  const normalized = normalizeCustomer(customer);
  const searchText = normalizeSearchText([normalized.name, normalized.phone_normalized, normalized.notes]);

  await db.runAsync(
    `
      INSERT INTO customers (
        id,
        tenant_id,
        name,
        phone_normalized,
        notes,
        orders_count,
        created_at,
        updated_at,
        deleted_at,
        search_text,
        payload_json,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        phone_normalized = excluded.phone_normalized,
        notes = excluded.notes,
        orders_count = excluded.orders_count,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        search_text = excluded.search_text,
        payload_json = excluded.payload_json,
        synced_at = excluded.synced_at;
    `,
    [
      normalized.id,
      normalized.tenant_id,
      normalized.name,
      normalized.phone_normalized,
      normalized.notes ?? null,
      normalized.orders_count ?? null,
      normalized.created_at,
      normalized.updated_at,
      normalized.deleted_at ?? null,
      searchText,
      JSON.stringify(normalized),
      syncedAt,
    ]
  );
}

export async function upsertLocalCustomer(customer: Customer, syncedAt = nowIsoString()): Promise<void> {
  await writeCustomerSnapshot(customer, syncedAt);
}

export async function upsertLocalCustomers(customers: Customer[], syncedAt = nowIsoString()): Promise<void> {
  if (customers.length === 0) {
    return;
  }

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    for (const customer of customers) {
      const normalized = normalizeCustomer(customer);
      const searchText = normalizeSearchText([normalized.name, normalized.phone_normalized, normalized.notes]);

      await db.runAsync(
        `
          INSERT INTO customers (
            id,
            tenant_id,
            name,
            phone_normalized,
            notes,
            orders_count,
            created_at,
            updated_at,
            deleted_at,
            search_text,
            payload_json,
            synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            name = excluded.name,
            phone_normalized = excluded.phone_normalized,
            notes = excluded.notes,
            orders_count = excluded.orders_count,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at,
            search_text = excluded.search_text,
            payload_json = excluded.payload_json,
            synced_at = excluded.synced_at;
        `,
        [
          normalized.id,
          normalized.tenant_id,
          normalized.name,
          normalized.phone_normalized,
          normalized.notes ?? null,
          normalized.orders_count ?? null,
          normalized.created_at,
          normalized.updated_at,
          normalized.deleted_at ?? null,
          searchText,
          JSON.stringify(normalized),
          syncedAt,
        ]
      );
    }
  });
}

export async function markLocalCustomerDeleted(customerId: string, deletedAt: string | null): Promise<void> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<LocalCustomerRow>("SELECT payload_json FROM customers WHERE id = ? LIMIT 1;", [customerId]);

  if (!row?.payload_json) {
    return;
  }

  const customer = normalizeCustomer(JSON.parse(row.payload_json) as Customer);
  customer.deleted_at = deletedAt;
  customer.updated_at = nowIsoString();
  await writeCustomerSnapshot(customer, nowIsoString());
}
