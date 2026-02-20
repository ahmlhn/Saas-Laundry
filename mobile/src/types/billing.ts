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
