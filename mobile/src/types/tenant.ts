export interface TenantPlanSummary {
  key: string | null;
  name: string | null;
  orders_limit: number | null;
}

export interface TenantStatsSummary {
  outlets_total: number;
  users_total: number;
  users_active: number;
  services_total: number;
}

export interface TenantProfile {
  id: string;
  name: string;
  status: "active" | "inactive" | string;
  plan: TenantPlanSummary;
  stats: TenantStatsSummary;
  updated_at: string | null;
}
