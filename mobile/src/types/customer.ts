export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone_normalized: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}
