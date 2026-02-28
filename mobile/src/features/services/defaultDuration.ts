import type { ServiceType } from "../../types/service";

export type ServiceDurationUnit = "day" | "hour";

export function getDefaultDurationDays(serviceType: ServiceType | string | null | undefined): number {
  const normalized = typeof serviceType === "string" ? serviceType.trim().toLowerCase() : "regular";

  if (normalized === "package" || normalized === "perfume") {
    return 1;
  }

  return 3;
}

export function getDefaultDurationHours(_serviceType: ServiceType | string | null | undefined): number {
  return 0;
}

export function getDefaultDurationUnit(_serviceType: ServiceType | string | null | undefined): ServiceDurationUnit {
  return "day";
}

export function resolveDurationValueAndUnit(
  durationDays: number | null | undefined,
  durationHours: number | null | undefined,
  serviceType: ServiceType | string | null | undefined,
): { value: number; unit: ServiceDurationUnit } {
  const days = typeof durationDays === "number" && Number.isFinite(durationDays) ? Math.max(Math.trunc(durationDays), 0) : 0;
  const hours = typeof durationHours === "number" && Number.isFinite(durationHours) ? Math.max(Math.trunc(durationHours), 0) : 0;

  if (days > 0) {
    return { value: days, unit: "day" };
  }

  if (hours > 0) {
    return { value: hours, unit: "hour" };
  }

  const fallbackUnit = getDefaultDurationUnit(serviceType);
  return {
    value: fallbackUnit === "day" ? getDefaultDurationDays(serviceType) : getDefaultDurationHours(serviceType),
    unit: fallbackUnit,
  };
}

export function resolveDurationPartsFromValue(value: number | null | undefined, unit: ServiceDurationUnit): { durationDays: number; durationHours: number } {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;

  if (unit === "hour") {
    return {
      durationDays: 0,
      durationHours: safeValue,
    };
  }

  return {
    durationDays: safeValue,
    durationHours: 0,
  };
}

export function formatServiceDuration(durationDays: number | null | undefined, durationHours: number | null | undefined, fallback = "Tanpa durasi"): string {
  const days = typeof durationDays === "number" && Number.isFinite(durationDays) ? Math.max(Math.trunc(durationDays), 0) : 0;
  const hours = typeof durationHours === "number" && Number.isFinite(durationHours) ? Math.max(Math.trunc(durationHours), 0) : 0;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} hari`);
  }

  if (hours > 0) {
    parts.push(`${hours} jam`);
  }

  return parts.length > 0 ? parts.join(" ") : fallback;
}
