import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

const MOBILE_DATABASE_NAME = "saas-laundry-mobile.db";
const MOBILE_DATABASE_SCHEMA_VERSION = 4;

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL");
  await db.execAsync("PRAGMA foreign_keys = ON");

  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  const currentVersion = Number(versionRow?.user_version ?? 0);

  if (currentVersion < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  }

  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone_normalized TEXT NOT NULL,
        notes TEXT,
        orders_count INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        search_text TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS customers_updated_at_idx ON customers(updated_at DESC);
      CREATE INDEX IF NOT EXISTS customers_search_text_idx ON customers(search_text);

      CREATE TABLE IF NOT EXISTS services (
        context_outlet_id TEXT NOT NULL,
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        service_type TEXT NOT NULL,
        parent_service_id TEXT,
        is_group INTEGER NOT NULL,
        unit_type TEXT NOT NULL,
        display_unit TEXT NOT NULL,
        base_price_amount INTEGER NOT NULL,
        duration_days INTEGER,
        duration_hours INTEGER,
        package_quota_value REAL,
        package_quota_unit TEXT,
        package_valid_days INTEGER,
        package_accumulation_mode TEXT,
        active INTEGER NOT NULL,
        show_in_cashier INTEGER NOT NULL,
        show_to_customer INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        image_icon TEXT,
        deleted_at TEXT,
        effective_price_amount INTEGER NOT NULL,
        search_text TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        PRIMARY KEY (context_outlet_id, id)
      );

      CREATE INDEX IF NOT EXISTS services_context_parent_idx ON services(context_outlet_id, parent_service_id);
      CREATE INDEX IF NOT EXISTS services_context_search_idx ON services(context_outlet_id, search_text);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        outlet_id TEXT NOT NULL,
        customer_id TEXT,
        customer_name TEXT,
        customer_phone_normalized TEXT,
        courier_user_id TEXT,
        courier_name TEXT,
        invoice_no TEXT,
        order_code TEXT NOT NULL,
        tracking_token TEXT,
        tracking_url TEXT,
        is_pickup_delivery INTEGER NOT NULL,
        requires_pickup INTEGER,
        requires_delivery INTEGER,
        laundry_status TEXT NOT NULL,
        courier_status TEXT,
        total_amount INTEGER NOT NULL,
        paid_amount INTEGER NOT NULL,
        due_amount INTEGER NOT NULL,
        shipping_fee_amount INTEGER,
        discount_amount INTEGER,
        notes TEXT,
        is_cancelled INTEGER NOT NULL,
        cancelled_at TEXT,
        cancelled_by INTEGER,
        cancelled_reason TEXT,
        pickup_json TEXT,
        delivery_json TEXT,
        estimated_completion_at TEXT,
        estimated_completion_duration_days INTEGER,
        estimated_completion_duration_hours INTEGER,
        estimated_completion_is_late INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        search_text TEXT NOT NULL,
        summary_payload_json TEXT NOT NULL,
        detail_payload_json TEXT,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS orders_outlet_updated_idx ON orders(outlet_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS orders_outlet_created_idx ON orders(outlet_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS orders_outlet_search_idx ON orders(outlet_id, search_text);

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        service_id TEXT,
        service_name_snapshot TEXT NOT NULL,
        unit_type_snapshot TEXT NOT NULL,
        qty TEXT,
        weight_kg TEXT,
        unit_price_amount INTEGER NOT NULL,
        subtotal_amount INTEGER NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        payload_json TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

      CREATE TABLE IF NOT EXISTS order_payments (
        id TEXT PRIMARY KEY NOT NULL,
        order_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        method TEXT NOT NULL,
        paid_at TEXT,
        notes TEXT,
        created_at TEXT,
        updated_at TEXT,
        payload_json TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS order_payments_order_idx ON order_payments(order_id);
    `);
  }

  if (currentVersion < 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS outbox_mutations (
        mutation_id TEXT PRIMARY KEY NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        outlet_id TEXT,
        entity_type TEXT,
        entity_id TEXT,
        client_time TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        reason_code TEXT,
        message TEXT,
        server_cursor TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS outbox_mutations_status_seq_idx ON outbox_mutations(status, seq);
      CREATE INDEX IF NOT EXISTS outbox_mutations_entity_idx ON outbox_mutations(entity_type, entity_id, status);

      CREATE TABLE IF NOT EXISTS invoice_leases (
        lease_id TEXT PRIMARY KEY NOT NULL,
        outlet_id TEXT NOT NULL,
        lease_date TEXT NOT NULL,
        prefix TEXT NOT NULL,
        from_counter INTEGER NOT NULL,
        to_counter INTEGER NOT NULL,
        next_counter INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS invoice_leases_outlet_date_idx ON invoice_leases(outlet_id, lease_date);
      CREATE INDEX IF NOT EXISTS invoice_leases_expiry_idx ON invoice_leases(expires_at);
    `);
  }

  if (currentVersion < 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS billing_entries (
        id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        outlet_id TEXT NOT NULL,
        entry_date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        category TEXT NOT NULL,
        notes TEXT,
        created_by INTEGER,
        created_by_name TEXT,
        source_channel TEXT NOT NULL,
        created_at TEXT,
        updated_at TEXT,
        payload_json TEXT NOT NULL,
        synced_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS billing_entries_outlet_date_idx ON billing_entries(outlet_id, entry_date DESC);
      CREATE INDEX IF NOT EXISTS billing_entries_outlet_type_idx ON billing_entries(outlet_id, type, entry_date DESC);
      CREATE INDEX IF NOT EXISTS billing_entries_updated_idx ON billing_entries(updated_at DESC, created_at DESC);
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${MOBILE_DATABASE_SCHEMA_VERSION}`);
}

export async function getLocalDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await openDatabaseAsync(MOBILE_DATABASE_NAME);
      await migrateDatabase(db);
      return db;
    })();
  }

  return databasePromise;
}

export async function initializeLocalDatabase(): Promise<void> {
  await getLocalDatabase();
}
