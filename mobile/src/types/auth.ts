export interface AuthUser {
  id: string;
  tenant_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: string;
}

export interface AllowedOutlet {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  timezone: string;
}

export interface PlanContext {
  key: string | null;
  orders_limit: number | null;
}

export interface QuotaContext {
  period: string;
  orders_limit: number | null;
  orders_used: number;
  orders_remaining: number | null;
  can_create_order: boolean;
}

export interface UserContext {
  user: AuthUser;
  roles: string[];
  allowed_outlets: AllowedOutlet[];
  workspace: "tenant" | "platform";
  plan: PlanContext;
  quota: QuotaContext;
  subscription: {
    state: string;
    write_access_mode: string;
    cycle_start_at: string | null;
    cycle_end_at: string | null;
  };
}

export interface LoginResponse {
  token_type: "Bearer";
  access_token: string;
  data: UserContext;
}

export interface MeResponse {
  data: UserContext;
}
