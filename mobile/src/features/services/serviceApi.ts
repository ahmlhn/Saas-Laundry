import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { ServiceCatalogItem, ServiceCreatePayload, ServiceType, ServiceUpdatePayload } from "../../types/service";

interface ServicesResponse {
  data: ServiceCatalogItem[];
}

interface ServiceResponse {
  data: ServiceCatalogItem;
}

interface ServiceArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

export interface ListServicesParams {
  outletId?: string;
  includeDeleted?: boolean;
  active?: boolean;
  serviceType?: ServiceType | ServiceType[];
  parentId?: string | null;
  isGroup?: boolean;
  withChildren?: boolean;
  q?: string;
  sort?: "name" | "updated_desc" | "price_asc" | "price_desc";
  limit?: number;
  forceRefresh?: boolean;
}

function normalizeServiceTypes(input: ServiceType | ServiceType[] | undefined): ServiceType[] {
  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return [...new Set(input)];
  }

  return [input];
}

function buildCacheKey(params: ListServicesParams): string {
  const outletId = params.outletId ?? "all";
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const active = typeof params.active === "boolean" ? (params.active ? "1" : "0") : "all";
  const serviceTypes = normalizeServiceTypes(params.serviceType).join(",") || "all";
  const parent = params.parentId === undefined ? "any" : params.parentId === null ? "null" : params.parentId;
  const isGroup = typeof params.isGroup === "boolean" ? (params.isGroup ? "1" : "0") : "all";
  const withChildren = params.withChildren ? "1" : "0";
  const q = params.q?.trim().toLowerCase() ?? "";
  const sort = params.sort ?? "name";
  const limit = params.limit ?? 200;

  return `services:list:${outletId}:${includeDeleted}:${active}:${serviceTypes}:${parent}:${isGroup}:${withChildren}:${q}:${sort}:${limit}`;
}

export async function listServices(params: ListServicesParams = {}): Promise<ServiceCatalogItem[]> {
  const cacheKey = buildCacheKey(params);

  if (!params.forceRefresh) {
    const cached = getCachedValue<ServiceCatalogItem[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const serviceTypes = normalizeServiceTypes(params.serviceType);

  const response = await httpClient.get<ServicesResponse>("/services", {
    params: {
      outlet_id: params.outletId || undefined,
      include_deleted: toQueryBoolean(params.includeDeleted),
      active: toQueryBoolean(params.active),
      service_type: serviceTypes.length > 0 ? serviceTypes : undefined,
      parent_id: params.parentId === undefined ? undefined : params.parentId,
      is_group: toQueryBoolean(params.isGroup),
      with_children: toQueryBoolean(params.withChildren),
      q: params.q?.trim() || undefined,
      sort: params.sort || undefined,
      limit: params.limit || undefined,
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function archiveService(serviceId: string): Promise<string | null> {
  const response = await httpClient.delete<ServiceArchiveResponse>(`/services/${serviceId}`);
  invalidateCache("services:list:");
  return response.data.data.deleted_at;
}

export async function restoreService(serviceId: string): Promise<ServiceCatalogItem> {
  const response = await httpClient.post<ServiceResponse>(`/services/${serviceId}/restore`);
  invalidateCache("services:list:");
  return response.data.data;
}

export async function createService(payload: ServiceCreatePayload): Promise<ServiceCatalogItem> {
  const response = await httpClient.post<ServiceResponse>("/services", {
    name: payload.name,
    service_type: payload.serviceType,
    parent_service_id: payload.parentServiceId,
    is_group: payload.isGroup,
    unit_type: payload.unitType,
    display_unit: payload.displayUnit,
    base_price_amount: payload.basePriceAmount,
    duration_days: payload.durationDays,
    package_quota_value: payload.packageQuotaValue,
    package_quota_unit: payload.packageQuotaUnit,
    package_valid_days: payload.packageValidDays,
    package_accumulation_mode: payload.packageAccumulationMode,
    active: payload.active ?? true,
    sort_order: payload.sortOrder,
    image_icon: payload.imageIcon,
    process_tag_ids: payload.processTagIds,
  });

  invalidateCache("services:list:");
  return response.data.data;
}

export async function updateService(serviceId: string, payload: ServiceUpdatePayload): Promise<ServiceCatalogItem> {
  const body: Record<string, unknown> = {};

  if (typeof payload.name === "string") {
    body.name = payload.name;
  }

  if (typeof payload.serviceType === "string") {
    body.service_type = payload.serviceType;
  }

  if ("parentServiceId" in payload) {
    body.parent_service_id = payload.parentServiceId ?? null;
  }

  if (typeof payload.isGroup === "boolean") {
    body.is_group = payload.isGroup;
  }

  if (typeof payload.unitType === "string") {
    body.unit_type = payload.unitType;
  }

  if (typeof payload.displayUnit === "string") {
    body.display_unit = payload.displayUnit;
  }

  if (typeof payload.basePriceAmount === "number") {
    body.base_price_amount = payload.basePriceAmount;
  }

  if ("durationDays" in payload) {
    body.duration_days = payload.durationDays ?? null;
  }

  if ("packageQuotaValue" in payload) {
    body.package_quota_value = payload.packageQuotaValue ?? null;
  }

  if ("packageQuotaUnit" in payload) {
    body.package_quota_unit = payload.packageQuotaUnit ?? null;
  }

  if ("packageValidDays" in payload) {
    body.package_valid_days = payload.packageValidDays ?? null;
  }

  if ("packageAccumulationMode" in payload) {
    body.package_accumulation_mode = payload.packageAccumulationMode ?? null;
  }

  if (typeof payload.active === "boolean") {
    body.active = payload.active;
  }

  if (typeof payload.sortOrder === "number") {
    body.sort_order = payload.sortOrder;
  }

  if ("imageIcon" in payload) {
    body.image_icon = payload.imageIcon ?? null;
  }

  if (Array.isArray(payload.processTagIds)) {
    body.process_tag_ids = payload.processTagIds;
  }

  const response = await httpClient.patch<ServiceResponse>(`/services/${serviceId}`, body);
  invalidateCache("services:list:");
  return response.data.data;
}
