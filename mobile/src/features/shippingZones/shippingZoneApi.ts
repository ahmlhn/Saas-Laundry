import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { ShippingZone } from "../../types/shippingZone";

interface ShippingZonesResponse {
  data: ShippingZone[];
}

interface ShippingZoneResponse {
  data: ShippingZone;
}

interface ListShippingZonesParams {
  outletId?: string;
  active?: boolean;
  forceRefresh?: boolean;
}

interface CreateShippingZonePayload {
  outletId: string;
  name: string;
  feeAmount: number;
  minDistanceKm?: number;
  maxDistanceKm?: number;
  etaMinutes?: number;
  active?: boolean;
  notes?: string;
}

export async function listShippingZones(params: ListShippingZonesParams = {}): Promise<ShippingZone[]> {
  const outletId = params.outletId ?? "all";
  const active = typeof params.active === "boolean" ? (params.active ? "1" : "0") : "all";
  const cacheKey = `shipping-zones:list:${outletId}:${active}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<ShippingZone[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<ShippingZonesResponse>("/shipping-zones", {
    params: {
      outlet_id: params.outletId || undefined,
      active: toQueryBoolean(params.active),
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function createShippingZone(payload: CreateShippingZonePayload): Promise<ShippingZone> {
  const response = await httpClient.post<ShippingZoneResponse>("/shipping-zones", {
    outlet_id: payload.outletId,
    name: payload.name,
    fee_amount: payload.feeAmount,
    min_distance_km: payload.minDistanceKm,
    max_distance_km: payload.maxDistanceKm,
    eta_minutes: payload.etaMinutes,
    active: payload.active ?? true,
    notes: payload.notes?.trim() || undefined,
  });

  invalidateCache("shipping-zones:list:");
  return response.data.data;
}
