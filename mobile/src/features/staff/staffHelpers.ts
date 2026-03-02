import { Ionicons } from "@expo/vector-icons";
import type { StaffAssignableRoleKey, StaffMember } from "../../types/staff";

export const STAFF_ROLE_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; hint: string }> = {
  owner: { label: "Owner", icon: "shield-checkmark-outline", hint: "Kontrol tenant penuh" },
  tenant_manager: { label: "Tenant Manager", icon: "briefcase-outline", hint: "Kontrol tenant harian" },
  admin: { label: "Admin", icon: "settings-outline", hint: "Atur operasional dan master data" },
  cashier: { label: "Kasir", icon: "card-outline", hint: "Kelola transaksi dan pembayaran" },
  worker: { label: "Pekerja", icon: "shirt-outline", hint: "Fokus proses laundry" },
  courier: { label: "Kurir", icon: "bicycle-outline", hint: "Pickup dan delivery" },
};

export function getStaffRoleMeta(roleKey: string | null | undefined) {
  return STAFF_ROLE_META[roleKey ?? ""] ?? { label: roleKey?.trim() || "Tanpa Role", icon: "person-outline" as const, hint: "Role belum dikenali" };
}

export function getStaffMainRoleKey(item: StaffMember): string {
  return item.roles[0]?.key ?? "";
}

export function buildAssignableStaffRoles(actorRoles: string[]): StaffAssignableRoleKey[] {
  return actorRoles.includes("owner") ? ["tenant_manager", "admin", "cashier", "worker", "courier"] : ["cashier", "worker", "courier"];
}

export function canManageStaffAssignment(actorRoles: string[], actorId: string | undefined, item: StaffMember): boolean {
  if (!actorId || actorId === item.id) {
    return false;
  }

  const targetRoles = item.roles.map((role) => role.key);
  if (targetRoles.includes("owner")) {
    return false;
  }

  return actorRoles.includes("owner") || (actorRoles.includes("admin") && !targetRoles.includes("admin"));
}
