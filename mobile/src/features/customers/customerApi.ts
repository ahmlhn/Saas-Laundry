import { httpClient } from "../../lib/httpClient";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { Customer } from "../../types/customer";

interface CustomersResponse {
  data: Customer[];
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
  const limit = params.limit ?? 40;
  const includeDeleted = params.includeDeleted ? "1" : "0";
  const cacheKey = `customers:list:${query}:${limit}:${includeDeleted}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<Customer[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<CustomersResponse>("/customers", {
    params: {
      q: query || undefined,
      limit,
      include_deleted: params.includeDeleted ?? undefined,
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
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
