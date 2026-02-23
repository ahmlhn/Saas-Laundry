export type ServiceType = "regular" | "package" | "perfume" | "item";

export type ServiceDisplayUnit = "kg" | "pcs" | "satuan";

export type PackageQuotaUnit = "kg" | "pcs";

export type PackageAccumulationMode = "accumulative" | "fixed_window";

export interface ServiceOutletOverride {
  id: string;
  active: boolean;
  price_override_amount: number | null;
  sla_override: string | null;
}

export interface ServiceProcessTag {
  id: string;
  tenant_id: string;
  name: string;
  color_hex: string;
  sort_order: number;
  active: boolean;
  deleted_at?: string | null;
}

export interface ServiceCatalogItem {
  id: string;
  tenant_id: string;
  name: string;
  service_type: ServiceType | string;
  parent_service_id: string | null;
  is_group: boolean;
  unit_type: "kg" | "pcs" | string;
  display_unit: ServiceDisplayUnit | string;
  base_price_amount: number;
  duration_days: number | null;
  package_quota_value: number | null;
  package_quota_unit: PackageQuotaUnit | null;
  package_valid_days: number | null;
  package_accumulation_mode: PackageAccumulationMode | null;
  active: boolean;
  sort_order: number;
  image_icon: string | null;
  deleted_at?: string | null;
  effective_price_amount: number;
  outlet_override: ServiceOutletOverride | null;
  process_tags: ServiceProcessTag[];
  process_summary: string | null;
  children: ServiceCatalogItem[];
}

export interface ServiceCreatePayload {
  name: string;
  serviceType?: ServiceType;
  parentServiceId?: string | null;
  isGroup?: boolean;
  unitType?: "kg" | "pcs";
  displayUnit?: ServiceDisplayUnit;
  basePriceAmount: number;
  durationDays?: number | null;
  packageQuotaValue?: number | null;
  packageQuotaUnit?: PackageQuotaUnit | null;
  packageValidDays?: number | null;
  packageAccumulationMode?: PackageAccumulationMode | null;
  active?: boolean;
  sortOrder?: number;
  imageIcon?: string | null;
  processTagIds?: string[];
}

export interface ServiceUpdatePayload {
  name?: string;
  serviceType?: ServiceType;
  parentServiceId?: string | null;
  isGroup?: boolean;
  unitType?: "kg" | "pcs";
  displayUnit?: ServiceDisplayUnit;
  basePriceAmount?: number;
  durationDays?: number | null;
  packageQuotaValue?: number | null;
  packageQuotaUnit?: PackageQuotaUnit | null;
  packageValidDays?: number | null;
  packageAccumulationMode?: PackageAccumulationMode | null;
  active?: boolean;
  sortOrder?: number;
  imageIcon?: string | null;
  processTagIds?: string[];
}
