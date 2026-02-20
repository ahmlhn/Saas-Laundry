import { httpClient } from "../../lib/httpClient";
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
}

interface UpsertCustomerPayload {
  name: string;
  phone: string;
  notes?: string;
}

export async function listCustomers(params: ListCustomersParams = {}): Promise<Customer[]> {
  const response = await httpClient.get<CustomersResponse>("/customers", {
    params: {
      q: params.query?.trim() || undefined,
      limit: params.limit ?? 40,
      include_deleted: params.includeDeleted ?? undefined,
    },
  });

  return response.data.data;
}

export async function createCustomer(payload: UpsertCustomerPayload): Promise<Customer> {
  const response = await httpClient.post<CustomerResponse>("/customers", {
    name: payload.name,
    phone: payload.phone,
    notes: payload.notes?.trim() || undefined,
  });

  return response.data.data;
}

export async function updateCustomer(customerId: string, payload: Partial<UpsertCustomerPayload>): Promise<Customer> {
  const response = await httpClient.patch<CustomerResponse>(`/customers/${customerId}`, {
    name: payload.name,
    phone: payload.phone,
    notes: payload.notes?.trim() || undefined,
  });

  return response.data.data;
}

export async function archiveCustomer(customerId: string): Promise<string | null> {
  const response = await httpClient.delete<CustomerArchiveResponse>(`/customers/${customerId}`);
  return response.data.data.deleted_at;
}

export async function restoreCustomer(customerId: string): Promise<Customer> {
  const response = await httpClient.post<CustomerResponse>(`/customers/${customerId}/restore`);
  return response.data.data;
}
