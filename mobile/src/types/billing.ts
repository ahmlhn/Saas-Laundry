export interface BillingQuotaSnapshot {
  plan: string | null;
  period: string;
  orders_limit: number | null;
  orders_used: number;
  orders_remaining: number | null;
  can_create_order: boolean;
}

export interface BillingSubscriptionPlan {
  key: string | null;
  name: string | null;
  orders_limit: number | null;
}

export interface BillingSubscription {
  id: string;
  period: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  plan: BillingSubscriptionPlan | null;
}

export interface BillingQuotaPayload {
  quota: BillingQuotaSnapshot;
  subscription: BillingSubscription | null;
}

export type BillingEntryType = "income" | "expense" | "adjustment";

export interface BillingEntry {
  id: string;
  tenant_id: string;
  outlet_id: string;
  entry_date: string;
  type: BillingEntryType;
  amount: number;
  category: string;
  notes: string | null;
  created_by: number | null;
  created_by_name: string | null;
  source_channel: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface BillingEntriesSummary {
  total_income: number;
  total_expense: number;
  total_adjustment: number;
  net_amount: number;
  entries_count: number;
}

export interface BillingEntriesFilters {
  outlet_id: string;
  type: BillingEntryType | null;
  start_date: string | null;
  end_date: string | null;
  limit: number;
}

export interface BillingEntriesPayload {
  data: BillingEntry[];
  summary: BillingEntriesSummary;
  filters: BillingEntriesFilters;
}
