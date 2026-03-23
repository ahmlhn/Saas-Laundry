import { getLocalDatabase } from "../localdb/database";
import { nowIsoString } from "../repositories/repositoryShared";

export interface InvoiceLeaseRange {
  lease_id: string;
  outlet_id: string;
  date: string;
  prefix: string;
  from: number;
  to: number;
  expires_at: string;
}

export interface InvoiceLeaseRecord {
  lease_id: string;
  outlet_id: string;
  lease_date: string;
  prefix: string;
  from_counter: number;
  to_counter: number;
  next_counter: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceLeaseRow extends InvoiceLeaseRecord {}

function formatInvoiceNumber(prefix: string, counter: number): string {
  return `${prefix}${String(counter).padStart(4, "0")}`;
}

function isLeaseExpired(expiresAt: string): boolean {
  const expiresAtTime = new Date(expiresAt).getTime();
  return Number.isFinite(expiresAtTime) ? expiresAtTime <= Date.now() : false;
}

export async function upsertInvoiceLeaseRanges(ranges: InvoiceLeaseRange[]): Promise<void> {
  if (ranges.length === 0) {
    return;
  }

  const db = await getLocalDatabase();
  await db.withTransactionAsync(async () => {
    for (const range of ranges) {
      const now = nowIsoString();
      const existing = await db.getFirstAsync<{ next_counter: number }>(
        "SELECT next_counter FROM invoice_leases WHERE lease_id = ? LIMIT 1;",
        [range.lease_id]
      );
      const nextCounter = Math.max(Number(existing?.next_counter ?? range.from), range.from);

      await db.runAsync(
        `
          INSERT INTO invoice_leases (
            lease_id,
            outlet_id,
            lease_date,
            prefix,
            from_counter,
            to_counter,
            next_counter,
            expires_at,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(lease_id) DO UPDATE SET
            outlet_id = excluded.outlet_id,
            lease_date = excluded.lease_date,
            prefix = excluded.prefix,
            from_counter = excluded.from_counter,
            to_counter = excluded.to_counter,
            next_counter = CASE
              WHEN invoice_leases.next_counter > excluded.next_counter THEN invoice_leases.next_counter
              ELSE excluded.next_counter
            END,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at;
        `,
        [
          range.lease_id,
          range.outlet_id,
          range.date,
          range.prefix,
          range.from,
          range.to,
          nextCounter,
          range.expires_at,
          now,
          now,
        ]
      );
    }
  });
}

export async function listInvoiceLeasesForOutlet(outletId: string): Promise<InvoiceLeaseRecord[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<InvoiceLeaseRow>(
    `
      SELECT *
      FROM invoice_leases
      WHERE outlet_id = ?
      ORDER BY lease_date ASC, from_counter ASC;
    `,
    [outletId]
  );

  return rows.map((row) => ({
    ...row,
    from_counter: Number(row.from_counter),
    to_counter: Number(row.to_counter),
    next_counter: Number(row.next_counter),
  }));
}

export async function getInvoiceLeaseAvailableCount(outletId: string, dateToken: string): Promise<number> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<InvoiceLeaseRow>(
    `
      SELECT *
      FROM invoice_leases
      WHERE outlet_id = ? AND lease_date = ?;
    `,
    [outletId, dateToken]
  );

  return rows.reduce((total, row) => {
    if (isLeaseExpired(row.expires_at)) {
      return total;
    }

    const remaining = Math.max(Number(row.to_counter) - Number(row.next_counter) + 1, 0);
    return total + remaining;
  }, 0);
}

export async function consumeInvoiceNumberFromLease(outletId: string, dateToken: string): Promise<string | null> {
  const db = await getLocalDatabase();
  let invoiceNo: string | null = null;

  await db.withTransactionAsync(async () => {
    const rows = await db.getAllAsync<InvoiceLeaseRow>(
      `
        SELECT *
        FROM invoice_leases
        WHERE outlet_id = ? AND lease_date = ?
        ORDER BY from_counter ASC;
      `,
      [outletId, dateToken]
    );

    const activeLease = rows.find((row) => !isLeaseExpired(row.expires_at) && Number(row.next_counter) <= Number(row.to_counter));
    if (!activeLease) {
      return;
    }

    const nextCounter = Number(activeLease.next_counter);
    invoiceNo = formatInvoiceNumber(activeLease.prefix, nextCounter);

    await db.runAsync(
      `
        UPDATE invoice_leases
        SET next_counter = ?, updated_at = ?
        WHERE lease_id = ?;
      `,
      [nextCounter + 1, nowIsoString(), activeLease.lease_id]
    );
  });

  return invoiceNo;
}
