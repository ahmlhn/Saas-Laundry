export interface StaffRole {
  id: string;
  key: string;
  name: string;
}

export interface StaffOutlet {
  id: string;
  name: string;
  code: string;
}

export interface StaffMember {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  deleted_at?: string | null;
  roles: StaffRole[];
  outlets: StaffOutlet[];
}

export type StaffAssignableRoleKey = "tenant_manager" | "admin" | "cashier" | "worker" | "courier";

export type StaffLifecycleStatus = "active" | "inactive";

export interface CreateStaffPayload {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  status: StaffLifecycleStatus;
  role_key: StaffAssignableRoleKey;
  outlet_ids: string[];
}

export interface UpdateStaffAssignmentPayload {
  name: string;
  email: string;
  phone?: string | null;
  password?: string | null;
  status: StaffLifecycleStatus;
  role_key: StaffAssignableRoleKey;
  outlet_ids: string[];
}
