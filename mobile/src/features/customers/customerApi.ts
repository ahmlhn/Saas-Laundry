import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
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

interface UpsertCustomerPayload {
  name: string;
  phone: string;
  notes?: string;
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

  if (!fetchAll) {
    const response = await httpClient.get<CustomersResponse>("/customers", {
      params: {
        q: query || undefined,
        limit,
        page,
        include_deleted: toQueryBoolean(params.includeDeleted),
      },
    });

    setCachedValue(cacheKey, response.data.data, 20_000);
    return response.data.data;
  }

  const merged: Customer[] = [];
  const seen = new Set<string>();
  let nextPage = 1;
  let hasMore = true;
  let guard = 0;

  while (hasMore && guard < 50) {
    guard += 1;
    let addedInPage = 0;

    const response = await httpClient.get<CustomersResponse>("/customers", {
      params: {
        q: query || undefined,
        limit,
        page: nextPage,
        include_deleted: toQueryBoolean(params.includeDeleted),
      },
    });

    for (const customer of response.data.data) {
      if (seen.has(customer.id)) {
        continue;
      }

      seen.add(customer.id);
      merged.push(customer);
      addedInPage += 1;
    }

    const responseHasMore = response.data.meta?.has_more;
    hasMore = typeof responseHasMore === "boolean" ? responseHasMore : response.data.data.length >= limit && addedInPage > 0;
    nextPage += 1;
  }

  setCachedValue(cacheKey, merged, 20_000);
  return merged;
}

export async function createCustomer(payload: UpsertCustomerPayload): Promise<Customer> {
  const response = await httpClient.post<CustomerResponse>("/customers", {
    name: payload.name,
    phone: payload.phone,
    notes: payload.notes?.trim() || undefined,
  });

  invalidateCache("customers:list:");
  return response.data.data;
}

export async function updateCustomer(customerId: string, payload: Partial<UpsertCustomerPayload>): Promise<Customer> {
  const response = await httpClient.patch<CustomerResponse>(`/customers/${customerId}`, {
    name: payload.name,
    phone: payload.phone,
    notes: payload.notes?.trim() || undefined,
  });

  invalidateCache("customers:list:");
  return response.data.data;
}

export async function archiveCustomer(customerId: string): Promise<string | null> {
  const response = await httpClient.delete<CustomerArchiveResponse>(`/customers/${customerId}`);
  invalidateCache("customers:list:");
  return response.data.data.deleted_at;
}

export async function restoreCustomer(customerId: string): Promise<Customer> {
  const response = await httpClient.post<CustomerResponse>(`/customers/${customerId}/restore`);
  invalidateCache("customers:list:");
  return response.data.data;
}
