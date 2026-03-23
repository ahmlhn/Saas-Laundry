import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import {
  hasAnyLocalCustomers,
  markLocalCustomerDeleted,
  readLocalCustomers,
  readLocalCustomersPage,
  upsertLocalCustomer,
  upsertLocalCustomers,
} from "../repositories/customersRepository";
import type { Customer } from "../../types/customer";

interface CustomersResponse {
  data: Customer[];
  meta?: {
    page: number;
    per_page: number;
    last_page: number;
    total: number;
    has_more: boolean;
  };
}

interface CustomerResponse {
  data: Customer;
}

interface CustomerArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

interface ListCustomersParams {
  query?: string;
  limit?: number;
  page?: number;
  fetchAll?: boolean;
  includeDeleted?: boolean;
  forceRefresh?: boolean;
}

export interface CustomerListPage {
  items: Customer[];
  page: number;
  hasMore: boolean;
  total: number | null;
}

interface UpsertCustomerPayload {
  name: string;
  phone: string;
  notes?: string;
}

async function fetchCustomersPageFromServer(params: Omit<ListCustomersParams, "fetchAll"> = {}): Promise<CustomerListPage> {
  const query = params.query?.trim() || "";
  const limit = Math.min(params.limit ?? 40, 100);
  const page = Math.max(params.page ?? 1, 1);

  const response = await httpClient.get<CustomersResponse>("/customers", {
    params: {
      q: query || undefined,
      limit,
      page,
      include_deleted: toQueryBoolean(params.includeDeleted),
    },
  });

  const responseHasMore = response.data.meta?.has_more;
  const fallbackHasMore = response.data.data.length >= limit;
  const result: CustomerListPage = {
    items: response.data.data,
    page,
    hasMore: typeof responseHasMore === "boolean" ? responseHasMore : fallbackHasMore,
    total: response.data.meta?.total ?? null,
  };

  await upsertLocalCustomers(result.items);
  return result;
}

export async function listCustomersPage(params: Omit<ListCustomersParams, "fetchAll"> = {}): Promise<CustomerListPage> {
  const query = params.query?.trim() || "";
  const limit = Math.min(params.limit ?? 40, 100);
  const page = Math.max(params.page ?? 1, 1);
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const cacheKey = `customers:list:page:${query}:${limit}:${includeDeleted}:page-${page}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<CustomerListPage>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const localPage = await readLocalCustomersPage({
    query,
    limit,
    page,
    includeDeleted: params.includeDeleted,
  });
  const hasLocalSnapshot = await hasAnyLocalCustomers({ includeDeleted: params.includeDeleted });
  const pageOffset = (page - 1) * limit;
  const canServeFromLocal =
    hasLocalSnapshot &&
    (page === 1 || localPage.items.length > 0 || Number(localPage.total ?? 0) <= pageOffset);

  if (!params.forceRefresh && canServeFromLocal) {
    setCachedValue(cacheKey, localPage, 20_000);
    return localPage;
  }

  let result = localPage;

  try {
    result = await fetchCustomersPageFromServer({
      query,
      limit,
      page,
      includeDeleted: params.includeDeleted,
    });
    result = await readLocalCustomersPage({
      query,
      limit,
      page,
      includeDeleted: params.includeDeleted,
    });
  } catch (error) {
    if (!hasLocalSnapshot) {
      throw error;
    }
  }

  setCachedValue(cacheKey, result, 20_000);
  return result;
}

export async function listCustomers(params: ListCustomersParams = {}): Promise<Customer[]> {
  const query = params.query?.trim() || "";
  const limit = Math.min(params.limit ?? 40, 100);
  const page = Math.max(params.page ?? 1, 1);
  const fetchAll = params.fetchAll === true;
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const cacheKey = `customers:list:${query}:${limit}:${includeDeleted}:${fetchAll ? "all" : `page-${page}`}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<Customer[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const hasLocalSnapshot = await hasAnyLocalCustomers({ includeDeleted: params.includeDeleted });
  const localItems = await readLocalCustomers({
    query,
    limit: fetchAll ? limit : limit,
    includeDeleted: params.includeDeleted,
  });

  if (!params.forceRefresh && hasLocalSnapshot) {
    const result = fetchAll ? localItems : localItems.slice(0, limit);
    setCachedValue(cacheKey, result, 20_000);
    return result;
  }

  try {
    if (!fetchAll) {
      const pageResult = await fetchCustomersPageFromServer({
        query,
        limit,
        page,
        includeDeleted: params.includeDeleted,
      });
      setCachedValue(cacheKey, pageResult.items, 20_000);
      return pageResult.items;
    }

    let nextPage = 1;
    let hasMore = true;
    let guard = 0;

    while (hasMore && guard < 50) {
      guard += 1;
      const pageResult = await fetchCustomersPageFromServer({
        query,
        limit,
        page: nextPage,
        includeDeleted: params.includeDeleted,
      });
      hasMore = pageResult.hasMore;
      nextPage += 1;
    }

    const refreshed = await readLocalCustomers({
      query,
      limit,
      includeDeleted: params.includeDeleted,
    });
    setCachedValue(cacheKey, refreshed, 20_000);
    return refreshed;
  } catch (error) {
    if (!hasLocalSnapshot) {
      throw error;
    }

    const result = fetchAll ? localItems : localItems.slice(0, limit);
    setCachedValue(cacheKey, result, 20_000);
    return result;
  }
}

export async function createCustomer(payload: UpsertCustomerPayload): Promise<Customer> {
  const response = await httpClient.post<CustomerResponse>("/customers", {
    name: payload.name,
    phone: payload.phone,
    notes: payload.notes?.trim() || undefined,
  });

  invalidateCache("customers:list:");
  await upsertLocalCustomer(response.data.data);
  return response.data.data;
}

export async function updateCustomer(customerId: string, payload: Partial<UpsertCustomerPayload>): Promise<Customer> {
  const response = await httpClient.patch<CustomerResponse>(`/customers/${customerId}`, {
    name: payload.name,
    phone: payload.phone,
    notes: payload.notes?.trim() || undefined,
  });

  invalidateCache("customers:list:");
  await upsertLocalCustomer(response.data.data);
  return response.data.data;
}

export async function archiveCustomer(customerId: string): Promise<string | null> {
  const response = await httpClient.delete<CustomerArchiveResponse>(`/customers/${customerId}`);
  invalidateCache("customers:list:");
  await markLocalCustomerDeleted(customerId, response.data.data.deleted_at);
  return response.data.data.deleted_at;
}

export async function restoreCustomer(customerId: string): Promise<Customer> {
  const response = await httpClient.post<CustomerResponse>(`/customers/${customerId}/restore`);
  invalidateCache("customers:list:");
  await upsertLocalCustomer(response.data.data);
  return response.data.data;
}
