export interface ServiceOutletOverride {
  id: string;
  active: boolean;
  price_override_amount: number | null;
  sla_override: string | null;
}

export interface ServiceCatalogItem {
  id: string;
  tenant_id: string;
  name: string;
  unit_type: "kg" | "pcs" | string;
  base_price_amount: number;
  active: boolean;
  deleted_at?: string | null;
  effective_price_amount: number;
  outlet_override: ServiceOutletOverride | null;
}
