export type PromotionType = "selection" | "automatic" | "voucher";

export type PromotionStatus = "draft" | "active" | "inactive" | "expired";

export type PromotionStackMode = "exclusive" | "stackable";

export type PromotionTargetType = "service" | "service_type" | "outlet" | "all";

export interface PromotionTarget {
  id: string;
  target_type: PromotionTargetType;
  target_id: string | null;
}

export interface PromotionVoucher {
  id: string;
  code: string;
  quota_total: number | null;
  quota_used: number;
  per_customer_limit: number | null;
  active: boolean;
  expires_at: string | null;
}

export interface PromotionRule {
  discount_type?: "fixed" | "percentage";
  discount_value?: number;
  minimum_amount?: number;
  max_discount?: number;
  applies_to?: "all" | "regular" | "package" | "perfume" | "item";
  [key: string]: unknown;
}

export interface Promotion {
  id: string;
  tenant_id: string;
  promo_type: PromotionType;
  name: string;
  status: PromotionStatus;
  start_at: string | null;
  end_at: string | null;
  priority: number;
  stack_mode: PromotionStackMode;
  rule_json: PromotionRule;
  notes: string | null;
  deleted_at: string | null;
  targets: PromotionTarget[];
  vouchers: PromotionVoucher[];
}

export interface PromotionSections {
  selection: Promotion[];
  automatic: Promotion[];
  voucher: Promotion[];
}

export interface PromotionCreatePayload {
  promoType: PromotionType;
  name: string;
  status?: PromotionStatus;
  startAt?: string | null;
  endAt?: string | null;
  priority?: number;
  stackMode?: PromotionStackMode;
  ruleJson?: PromotionRule;
  notes?: string | null;
  targets?: Array<{
    targetType: PromotionTargetType;
    targetId?: string | null;
  }>;
  vouchers?: Array<{
    code: string;
    quotaTotal?: number | null;
    perCustomerLimit?: number | null;
    active?: boolean;
    expiresAt?: string | null;
  }>;
}

export interface PromotionUpdatePayload extends Partial<PromotionCreatePayload> {}
