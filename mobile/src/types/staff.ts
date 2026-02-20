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
