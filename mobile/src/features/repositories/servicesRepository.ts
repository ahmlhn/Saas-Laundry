import { getLocalDatabase } from "../localdb/database";
import { nowIsoString, normalizeSearchText, resolveServiceContextOutletId, safeJsonParse, toDbBoolean } from "./repositoryShared";
import type { ListServicesParams } from "../services/serviceApi";
import type { ServiceCatalogItem } from "../../types/service";

interface LocalServiceRow {
  payload_json: string;
}

function normalizeService(item: ServiceCatalogItem): ServiceCatalogItem {
  return {
    ...item,
    deleted_at: item.deleted_at ?? null,
    outlet_override: item.outlet_override ?? null,
    process_tags: item.process_tags ?? [],
    children: item.children ?? [],
  };
}

function flattenServices(items: ServiceCatalogItem[]): ServiceCatalogItem[] {
  const flattened: ServiceCatalogItem[] = [];

  const visit = (item: ServiceCatalogItem) => {
    const normalized = normalizeService(item);
    flattened.push({
      ...normalized,
      children: [],
    });

    for (const child of item.children ?? []) {
      visit(child);
    }
  };

  for (const item of items) {
    visit(item);
  }

  return flattened;
}

function normalizeServiceTypes(input: ListServicesParams["serviceType"]): string[] {
  if (!input) {
    return [];
  }

  return Array.isArray(input) ? [...new Set(input)] : [input];
}

function filterServices(items: ServiceCatalogItem[], params: ListServicesParams): ServiceCatalogItem[] {
  const keyword = params.q?.trim().toLowerCase() ?? "";
  const serviceTypes = normalizeServiceTypes(params.serviceType);

  return items.filter((item) => {
    if (!params.includeDeleted && item.deleted_at) {
      return false;
    }

    if (typeof params.active === "boolean" && item.active !== params.active) {
      return false;
    }

    if (serviceTypes.length > 0 && !serviceTypes.includes(item.service_type)) {
      return false;
    }

    if (typeof params.isGroup === "boolean" && item.is_group !== params.isGroup) {
      return false;
    }

    if (params.parentId !== undefined && item.parent_service_id !== params.parentId) {
      return false;
    }

    if (keyword.length > 0) {
      const haystack = normalizeSearchText([
        item.name,
        item.unit_type,
        item.service_type,
        item.process_summary,
        item.outlet_override?.sla_override,
      ]);

      if (!haystack.includes(keyword)) {
        return false;
      }
    }

    return true;
  });
}

function sortServices(items: ServiceCatalogItem[], sort: ListServicesParams["sort"]): ServiceCatalogItem[] {
  const result = [...items];
  const selectedSort = sort ?? "name";

  result.sort((left, right) => {
    if (selectedSort === "updated_desc") {
      return right.name.localeCompare(left.name, "id-ID");
    }

    if (selectedSort === "price_asc") {
      return left.effective_price_amount - right.effective_price_amount || left.name.localeCompare(right.name, "id-ID");
    }

    if (selectedSort === "price_desc") {
      return right.effective_price_amount - left.effective_price_amount || left.name.localeCompare(right.name, "id-ID");
    }

    const sortOrder = (left.sort_order ?? 0) - (right.sort_order ?? 0);
    if (sortOrder !== 0) {
      return sortOrder;
    }

    return left.name.localeCompare(right.name, "id-ID");
  });

  return result;
}

function buildChildrenTree(items: ServiceCatalogItem[]): ServiceCatalogItem[] {
  const byParent = new Map<string | null, ServiceCatalogItem[]>();

  for (const item of items) {
    const parentKey = item.parent_service_id ?? null;
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push({ ...item, children: [] });
    byParent.set(parentKey, bucket);
  }

  const attachChildren = (item: ServiceCatalogItem): ServiceCatalogItem => {
    const children = (byParent.get(item.id) ?? []).map(attachChildren);
    return {
      ...item,
      children,
    };
  };

  return (byParent.get(null) ?? []).map(attachChildren);
}

export async function hasAnyLocalServices(outletId?: string): Promise<boolean> {
  const db = await getLocalDatabase();
  const contextOutletId = resolveServiceContextOutletId(outletId);
  const row = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) as total FROM services WHERE context_outlet_id = ?;",
    [contextOutletId]
  );

  return Number(row?.total ?? 0) > 0;
}

export async function readLocalServices(params: ListServicesParams = {}): Promise<ServiceCatalogItem[]> {
  const db = await getLocalDatabase();
  const contextOutletId = resolveServiceContextOutletId(params.outletId);
  const rows = await db.getAllAsync<LocalServiceRow>(
    "SELECT payload_json FROM services WHERE context_outlet_id = ?;",
    [contextOutletId]
  );

  const items = rows.map((row) => normalizeService(safeJsonParse<ServiceCatalogItem>(row.payload_json, {} as ServiceCatalogItem)));
  const filtered = sortServices(filterServices(items, params), params.sort);

  if (!params.withChildren) {
    return filtered.map((item) => ({
      ...item,
      children: [],
    }));
  }

  return buildChildrenTree(filtered);
}

export async function readLocalServicesByIds(outletId: string | undefined, serviceIds: string[]): Promise<ServiceCatalogItem[]> {
  if (serviceIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(serviceIds)];
  const db = await getLocalDatabase();
  const contextOutletId = resolveServiceContextOutletId(outletId);
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = await db.getAllAsync<LocalServiceRow>(
    `
      SELECT payload_json
      FROM services
      WHERE context_outlet_id = ?
        AND id IN (${placeholders});
    `,
    [contextOutletId, ...uniqueIds]
  );

  return rows.map((row) => normalizeService(safeJsonParse<ServiceCatalogItem>(row.payload_json, {} as ServiceCatalogItem)));
}

export async function upsertLocalServices(
  services: ServiceCatalogItem[],
  options: {
    outletId?: string;
    syncedAt?: string;
  } = {}
): Promise<void> {
  if (services.length === 0) {
    return;
  }

  const db = await getLocalDatabase();
  const contextOutletId = resolveServiceContextOutletId(options.outletId);
  const syncedAt = options.syncedAt ?? nowIsoString();
  const flattened = flattenServices(services);

  await db.withTransactionAsync(async () => {
    for (const rawItem of flattened) {
      const item = normalizeService(rawItem);
      const searchText = normalizeSearchText([
        item.name,
        item.unit_type,
        item.service_type,
        item.process_summary,
        item.outlet_override?.sla_override,
      ]);

      await db.runAsync(
        `
          INSERT INTO services (
            context_outlet_id,
            id,
            tenant_id,
            name,
            service_type,
            parent_service_id,
            is_group,
            unit_type,
            display_unit,
            base_price_amount,
            duration_days,
            duration_hours,
            package_quota_value,
            package_quota_unit,
            package_valid_days,
            package_accumulation_mode,
            active,
            show_in_cashier,
            show_to_customer,
            sort_order,
            image_icon,
            deleted_at,
            effective_price_amount,
            search_text,
            payload_json,
            synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(context_outlet_id, id) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            name = excluded.name,
            service_type = excluded.service_type,
            parent_service_id = excluded.parent_service_id,
            is_group = excluded.is_group,
            unit_type = excluded.unit_type,
            display_unit = excluded.display_unit,
            base_price_amount = excluded.base_price_amount,
            duration_days = excluded.duration_days,
            duration_hours = excluded.duration_hours,
            package_quota_value = excluded.package_quota_value,
            package_quota_unit = excluded.package_quota_unit,
            package_valid_days = excluded.package_valid_days,
            package_accumulation_mode = excluded.package_accumulation_mode,
            active = excluded.active,
            show_in_cashier = excluded.show_in_cashier,
            show_to_customer = excluded.show_to_customer,
            sort_order = excluded.sort_order,
            image_icon = excluded.image_icon,
            deleted_at = excluded.deleted_at,
            effective_price_amount = excluded.effective_price_amount,
            search_text = excluded.search_text,
            payload_json = excluded.payload_json,
            synced_at = excluded.synced_at;
        `,
        [
          contextOutletId,
          item.id,
          item.tenant_id,
          item.name,
          item.service_type,
          item.parent_service_id ?? null,
          toDbBoolean(item.is_group) ?? 0,
          item.unit_type,
          item.display_unit,
          item.base_price_amount,
          item.duration_days ?? null,
          item.duration_hours ?? 0,
          item.package_quota_value ?? null,
          item.package_quota_unit ?? null,
          item.package_valid_days ?? null,
          item.package_accumulation_mode ?? null,
          toDbBoolean(item.active) ?? 0,
          toDbBoolean(item.show_in_cashier) ?? 0,
          toDbBoolean(item.show_to_customer) ?? 0,
          item.sort_order ?? 0,
          item.image_icon ?? null,
          item.deleted_at ?? null,
          item.effective_price_amount,
          searchText,
          JSON.stringify({
            ...item,
            children: [],
          }),
          syncedAt,
        ]
      );
    }
  });
}

export async function markLocalServiceDeleted(outletId: string | undefined, serviceId: string, deletedAt: string | null): Promise<void> {
  const db = await getLocalDatabase();
  const contextOutletId = resolveServiceContextOutletId(outletId);
  const row = await db.getFirstAsync<LocalServiceRow>(
    "SELECT payload_json FROM services WHERE context_outlet_id = ? AND id = ? LIMIT 1;",
    [contextOutletId, serviceId]
  );

  if (!row?.payload_json) {
    return;
  }

  const item = normalizeService(safeJsonParse<ServiceCatalogItem>(row.payload_json, {} as ServiceCatalogItem));
  item.deleted_at = deletedAt;
  item.children = [];
  await upsertLocalServices([item], { outletId });
}
