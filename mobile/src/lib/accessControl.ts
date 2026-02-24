export type UserRole = "platform_owner" | "platform_billing" | "owner" | "tenant_manager" | "admin" | "cashier" | "worker" | "courier";

const WA_ALLOWED_PLAN_KEYS = new Set(["premium", "pro"]);

export function hasAnyRole(roles: string[], allowed: UserRole[]): boolean {
  return roles.some((role) => allowed.includes(role as UserRole));
}

export function canSeeQuickActionTab(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "admin", "cashier"]);
}

export function canSeeReportsTab(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "admin", "cashier"]);
}

export function canManageFinance(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "admin"]);
}

export function canManageCustomers(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "admin", "cashier"]);
}

export function canManagePrinterNote(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "admin", "cashier"]);
}

export function canOpenWaModule(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "admin"]);
}

export function canManageTenantProfile(roles: string[]): boolean {
  return hasAnyRole(roles, ["owner", "tenant_manager"]);
}

export function isWaPlanEligible(planKey: string | null | undefined): boolean {
  const key = (planKey ?? "").trim().toLowerCase();
  if (!key) {
    return false;
  }

  return WA_ALLOWED_PLAN_KEYS.has(key);
}
