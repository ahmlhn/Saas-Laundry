import type { ServiceType } from "../../types/service";

export function getDefaultDurationDays(serviceType: ServiceType | string | null | undefined): number {
  const normalized = typeof serviceType === "string" ? serviceType.trim().toLowerCase() : "regular";

  if (normalized === "package" || normalized === "perfume") {
    return 1;
  }

  return 3;
}
