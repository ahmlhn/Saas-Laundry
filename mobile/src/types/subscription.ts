export interface SubscriptionPlanOption {
  id: number;
  key: string;
  name: string;
  orders_limit: number | null;
  monthly_price_amount: number;
  currency: string;
  is_current: boolean;
}

export interface SubscriptionCyclePlan {
  id: number;
  key: string;
  name: string;
  orders_limit: number | null;
  monthly_price_amount: number;
  currency: string;
}

export interface SubscriptionCycleSummary {
  id: string;
  status: string;
  plan: SubscriptionCyclePlan | null;
  orders_limit_snapshot: number | null;
  cycle_start_at: string | null;
  cycle_end_at: string | null;
  auto_renew: boolean;
  activated_at: string | null;
}

export interface SubscriptionChangePlan {
  id: number;
  key: string;
  name: string;
  orders_limit: number | null;
  monthly_price_amount: number;
  currency: string;
}

export interface SubscriptionChangeRequest {
  id: string;
  tenant_id: string;
  current_cycle_id: string | null;
  status: string;
  effective_at: string | null;
  decision_note: string | null;
  target_plan: SubscriptionChangePlan | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionInvoice {
  id: string;
  tenant_id: string;
  cycle_id: string | null;
  invoice_no: string;
  amount_total: number;
  currency: string;
  tax_included: boolean;
  payment_method: string;
  status: string;
  issued_at: string | null;
  due_at: string | null;
  paid_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  proofs_count?: number;
}

export interface SubscriptionTenantSummary {
  id: string;
  name: string;
  subscription_state: string;
  write_access_mode: string;
}

export interface SubscriptionCurrentPayload {
  tenant: SubscriptionTenantSummary;
  current_cycle: SubscriptionCycleSummary | null;
  quota: {
    plan: string | null;
    period: string;
    orders_limit: number | null;
    orders_used: number;
    orders_remaining: number | null;
    can_create_order: boolean;
    subscription_state: string;
    write_access_mode: string;
    cycle_start_at: string | null;
    cycle_end_at: string | null;
  };
  pending_change_request: SubscriptionChangeRequest | null;
  next_invoice: SubscriptionInvoice | null;
}

export interface SubscriptionInvoiceProofUploadPayload {
  invoice: SubscriptionInvoice;
  proof: {
    id: string;
    invoice_id: string;
    tenant_id: string;
    status: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    checksum_sha256: string | null;
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
}
