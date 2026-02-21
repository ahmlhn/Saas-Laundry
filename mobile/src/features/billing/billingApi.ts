import { httpClient } from "../../lib/httpClient";
import type { BillingEntriesFilters, BillingEntriesPayload, BillingEntriesSummary, BillingEntry, BillingEntryType, BillingQuotaPayload } from "../../types/billing";

interface BillingQuotaResponse {
  data: BillingQuotaPayload;
}

interface BillingQuotaParams {
  period?: string;
}

export async function getBillingQuota(params: BillingQuotaParams = {}): Promise<BillingQuotaPayload> {
  const response = await httpClient.get<BillingQuotaResponse>("/billing/quota", {
    params: {
      period: params.period?.trim() || undefined,
    },
  });

  return response.data.data;
}

interface BillingEntriesResponse {
  data: BillingEntry[];
  meta: {
    summary: BillingEntriesSummary;
    filters: BillingEntriesFilters;
  };
}

export interface BillingEntriesParams {
  outletId: string;
  type?: BillingEntryType;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export async function listBillingEntries(params: BillingEntriesParams): Promise<BillingEntriesPayload> {
  const response = await httpClient.get<BillingEntriesResponse>("/billing/entries", {
    params: {
      outlet_id: params.outletId,
      type: params.type || undefined,
      start_date: params.startDate || undefined,
      end_date: params.endDate || undefined,
      limit: params.limit ?? 50,
    },
  });

  return {
    data: response.data.data,
    summary: response.data.meta.summary,
    filters: response.data.meta.filters,
  };
}

export interface BillingEntryCreatePayload {
  outletId: string;
  type: BillingEntryType;
  amount: number;
  category: string;
  notes?: string;
  entryDate?: string;
}

interface BillingEntryCreateResponse {
  data: BillingEntry;
}

export async function createBillingEntry(payload: BillingEntryCreatePayload): Promise<BillingEntry> {
  const response = await httpClient.post<BillingEntryCreateResponse>("/billing/entries", {
    outlet_id: payload.outletId,
    type: payload.type,
    amount: payload.amount,
    category: payload.category.trim(),
    notes: payload.notes?.trim() || undefined,
    entry_date: payload.entryDate || undefined,
  });

  return response.data.data;
}
