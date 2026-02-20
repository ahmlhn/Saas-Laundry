export interface ShippingZone {
  id: string;
  tenant_id: string;
  outlet_id: string;
  name: string;
  min_distance_km: number | null;
  max_distance_km: number | null;
  fee_amount: number;
  eta_minutes: number | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
