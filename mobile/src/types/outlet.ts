export interface OutletItem {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  timezone: string;
  address: string | null;
  deleted_at?: string | null;
}
