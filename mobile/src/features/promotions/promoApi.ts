import { httpClient } from "../../lib/httpClient";
import { toQueryBoolean } from "../../lib/httpQuery";
import { getCachedValue, invalidateCache, setCachedValue } from "../../lib/queryCache";
import type { Promotion, PromotionCreatePayload, PromotionSections, PromotionUpdatePayload } from "../../types/promotion";

interface PromotionListResponse {
  data: Promotion[];
}

interface PromotionResponse {
  data: Promotion;
}

interface PromotionSectionsResponse {
  data: PromotionSections;
}

interface PromotionArchiveResponse {
  data: {
    id: string;
    deleted_at: string | null;
  };
}

interface ListPromotionsParams {
  q?: string;
  status?: "draft" | "active" | "inactive" | "expired";
  promoType?: "selection" | "automatic" | "voucher";
  includeDeleted?: boolean;
  forceRefresh?: boolean;
}

function normalizeTargets(payload: PromotionCreatePayload | PromotionUpdatePayload) {
  return payload.targets?.map((target) => ({
    target_type: target.targetType,
    target_id: target.targetId ?? null,
  }));
}

function normalizeVouchers(payload: PromotionCreatePayload | PromotionUpdatePayload) {
  return payload.vouchers?.map((voucher) => ({
    code: voucher.code,
    quota_total: voucher.quotaTotal ?? null,
    per_customer_limit: voucher.perCustomerLimit ?? null,
    active: voucher.active ?? true,
    expires_at: voucher.expiresAt ?? null,
  }));
}

export async function listPromotions(params: ListPromotionsParams = {}): Promise<Promotion[]> {
  const cacheKey = `promotions:list:${params.status ?? "all"}:${params.promoType ?? "all"}:${params.includeDeleted ? "1" : "0"}:${
    params.q?.trim().toLowerCase() ?? ""
  }`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<Promotion[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<PromotionListResponse>("/promotions", {
    params: {
      q: params.q?.trim() || undefined,
      status: params.status || undefined,
      promo_type: params.promoType || undefined,
      include_deleted: toQueryBoolean(params.includeDeleted),
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function listPromotionSections(params: { status?: "active" | "all" | "draft" | "inactive" | "expired"; forceRefresh?: boolean } = {}) {
  const status = params.status ?? "active";
  const cacheKey = `promotions:sections:${status}`;

  if (!params.forceRefresh) {
    const cached = getCachedValue<PromotionSections>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const response = await httpClient.get<PromotionSectionsResponse>("/promotions/sections", {
    params: {
      status,
    },
  });

  setCachedValue(cacheKey, response.data.data, 20_000);
  return response.data.data;
}

export async function createPromotion(payload: PromotionCreatePayload): Promise<Promotion> {
  const response = await httpClient.post<PromotionResponse>("/promotions", {
    promo_type: payload.promoType,
    name: payload.name,
    status: payload.status,
    start_at: payload.startAt ?? null,
    end_at: payload.endAt ?? null,
    priority: payload.priority,
    stack_mode: payload.stackMode,
    rule_json: payload.ruleJson ?? {},
    notes: payload.notes ?? null,
    targets: normalizeTargets(payload),
    vouchers: normalizeVouchers(payload),
  });

  invalidateCache("promotions:list:");
  invalidateCache("promotions:sections:");
  return response.data.data;
}

export async function updatePromotion(promotionId: string, payload: PromotionUpdatePayload): Promise<Promotion> {
  const body: Record<string, unknown> = {};

  if (typeof payload.promoType === "string") {
    body.promo_type = payload.promoType;
  }

  if (typeof payload.name === "string") {
    body.name = payload.name;
  }

  if (typeof payload.status === "string") {
    body.status = payload.status;
  }

  if ("startAt" in payload) {
    body.start_at = payload.startAt ?? null;
  }

  if ("endAt" in payload) {
    body.end_at = payload.endAt ?? null;
  }

  if (typeof payload.priority === "number") {
    body.priority = payload.priority;
  }

  if (typeof payload.stackMode === "string") {
    body.stack_mode = payload.stackMode;
  }

  if ("ruleJson" in payload) {
    body.rule_json = payload.ruleJson ?? {};
  }

  if ("notes" in payload) {
    body.notes = payload.notes ?? null;
  }

  if ("targets" in payload) {
    body.targets = normalizeTargets(payload);
  }

  if ("vouchers" in payload) {
    body.vouchers = normalizeVouchers(payload);
  }

  const response = await httpClient.patch<PromotionResponse>(`/promotions/${promotionId}`, body);
  invalidateCache("promotions:list:");
  invalidateCache("promotions:sections:");
  return response.data.data;
}

export async function archivePromotion(promotionId: string): Promise<string | null> {
  const response = await httpClient.delete<PromotionArchiveResponse>(`/promotions/${promotionId}`);
  invalidateCache("promotions:list:");
  invalidateCache("promotions:sections:");
  return response.data.data.deleted_at;
}
