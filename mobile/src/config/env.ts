const FALLBACK_API_URL = "http://127.0.0.1:8000";
const DEFAULT_API_FALLBACKS = ["http://10.0.2.2:8000", "http://127.0.0.1:8000", "http://localhost:8000"];

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || FALLBACK_API_URL;
const configuredFallbacks = process.env.EXPO_PUBLIC_API_URL_FALLBACKS?.split(",")
  .map((item: string) => item.trim())
  .filter((item: string) => item.length > 0) ?? [];

export const API_BASE_URL = trimTrailingSlash(configuredApiUrl);

export const API_BASE_URL_CANDIDATES = Array.from(
  new Set(
    [API_BASE_URL, ...configuredFallbacks, ...DEFAULT_API_FALLBACKS]
      .map((url) => trimTrailingSlash(url))
      .filter((url) => /^https?:\/\//i.test(url))
  )
);

export const MOBILE_DEVICE_NAME = process.env.EXPO_PUBLIC_DEVICE_NAME?.trim() || "mobile-app";
