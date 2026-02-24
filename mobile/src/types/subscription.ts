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
  gateway_provider: string | null;
  gateway_reference: string | null;
  gateway_status: string | null;
  gateway_paid_amount: number | null;
  gateway_updated_at: string | null;
  qris_payload: string | null;
  qris_expired_at: string | null;
  issued_at: string | null;
  due_at: string | null;
  paid_verified_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  proofs_count?: number;
}

export interface SubscriptionPaymentIntent {
  id: string;
  invoice_id: string;
  tenant_id: string;
  provider: string;
  intent_reference: string;
  amount_total: number;
  currency: string;
  status: string;
  qris_payload: string | null;
  expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionPaymentEvent {
  id: string;
  invoice_id: string | null;
  tenant_id: string | null;
  provider: string;
  gateway_event_id: string;
  event_type: string;
  event_status: string | null;
  amount_total: number | null;
  currency: string | null;
  gateway_reference: string | null;
  signature_valid: boolean;
  process_status: string;
  rejection_reason: string | null;
  received_at: string | null;
  processed_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface SubscriptionGatewayStatus {
  invoice: SubscriptionInvoice;
  latest_intent: SubscriptionPaymentIntent | null;
  latest_event: SubscriptionPaymentEvent | null;
  events: SubscriptionPaymentEvent[];
}

export interface SubscriptionPaymentIntentPayload {
  invoice: SubscriptionInvoice;
  intent: SubscriptionPaymentIntent;
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

export interface PlatformSubscriptionTenantListItem {
  id: string;
  name: string;
  status: string;
  subscription_state: string;
  write_access_mode: string;
  current_plan: {
    id: number;
    key: string;
    name: string;
    orders_limit: number | null;
    monthly_price_amount: number;
    currency: string;
  } | null;
  current_cycle: {
    id: string;
    status: string;
    cycle_start_at: string | null;
    cycle_end_at: string | null;
    auto_renew: boolean;
  } | null;
  next_due_invoice: {
    id: string;
    invoice_no: string;
    status: string;
    amount_total: number;
    currency: string;
    due_at: string | null;
  } | null;
  latest_gateway_transaction: {
    id: string;
    invoice_id: string | null;
    gateway_event_id: string;
    event_type: string;
    process_status: string;
    rejection_reason: string | null;
    received_at: string | null;
  } | null;
}

export interface PlatformSubscriptionInvoiceProof {
  id: string;
  status: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string | null;
}

export interface PlatformSubscriptionTenantDetailPayload {
  tenant: {
    id: string;
    name: string;
    status: string;
    subscription_state: string;
    write_access_mode: string;
  };
  current_plan: {
    id: number;
    key: string;
    name: string;
    orders_limit: number | null;
    monthly_price_amount: number;
    currency: string;
  } | null;
  current_cycle: {
    id: string;
    status: string;
    orders_limit_snapshot: number | null;
    cycle_start_at: string | null;
    cycle_end_at: string | null;
    auto_renew: boolean;
    activated_at: string | null;
  } | null;
  latest_gateway_transaction: {
    id: string;
    invoice_id: string | null;
    gateway_event_id: string;
    event_type: string;
    event_status: string | null;
    amount_total: number | null;
    currency: string | null;
    gateway_reference: string | null;
    process_status: string;
    rejection_reason: string | null;
    received_at: string | null;
    processed_at: string | null;
  } | null;
  invoices: Array<{
    id: string;
    invoice_no: string;
    status: string;
    payment_method: string;
    gateway_provider: string | null;
    gateway_reference: string | null;
    gateway_status: string | null;
    gateway_paid_amount: number | null;
    gateway_updated_at: string | null;
    amount_total: number;
    currency: string;
    issued_at: string | null;
    due_at: string | null;
    paid_verified_at: string | null;
    latest_event: {
      id: string;
      gateway_event_id: string;
      event_type: string;
      event_status: string | null;
      amount_total: number | null;
      currency: string | null;
      process_status: string;
      received_at: string | null;
    } | null;
    proofs: PlatformSubscriptionInvoiceProof[];
  }>;
}

export interface PlatformSubscriptionInvoiceVerifyResult {
  invoice: {
    id: string;
    status: string;
    paid_verified_at: string | null;
    verified_by: string | null;
  };
  proof: {
    id: string;
    status: string;
    reviewed_at: string | null;
    review_note: string | null;
  } | null;
}

export interface PlatformSubscriptionTenantStateResult {
  tenant_id: string;
  subscription_state: string;
  write_access_mode: string;
  current_subscription_cycle_id?: string | null;
}

export interface PlatformSubscriptionPaymentEvent {
  id: string;
  tenant: {
    id: string;
    name: string;
  } | null;
  invoice: {
    id: string;
    invoice_no: string;
    payment_method: string;
    status: string;
  } | null;
  provider: string;
  gateway_event_id: string;
  event_type: string;
  event_status: string | null;
  amount_total: number | null;
  currency: string | null;
  gateway_reference: string | null;
  signature_valid: boolean;
  process_status: string;
  rejection_reason: string | null;
  received_at: string | null;
  processed_at: string | null;
}
