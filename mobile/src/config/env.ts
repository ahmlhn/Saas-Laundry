const FALLBACK_API_URL = "https://saas.daratlaut.com";
const DEFAULT_API_FALLBACKS = [
  "https://saas.daratlaut.com",
  "http://10.0.2.2:8000",
  "http://127.0.0.1:8000",
  "http://localhost:8000",
];

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeApiBaseUrl(url: string): string {
  const trimmed = trimTrailingSlash(url.trim());
  return trimmed.replace(/\/api$/i, "");
}

function readPublicEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

const configuredApiUrl = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL?.trim() || FALLBACK_API_URL);
const configuredFallbacks = process.env.EXPO_PUBLIC_API_URL_FALLBACKS?.split(",")
  .map((item: string) => normalizeApiBaseUrl(item))
  .filter((item: string) => item.length > 0) ?? [];

export const API_BASE_URL = configuredApiUrl;

function withIndexPhpFallback(url: string): string[] {
  const trimmed = normalizeApiBaseUrl(url);
  if (/\/index\.php$/i.test(trimmed)) {
    return [trimmed];
  }

  return [trimmed, `${trimmed}/index.php`];
}

export const API_BASE_URL_CANDIDATES = Array.from(
  new Set(
    [API_BASE_URL, ...configuredFallbacks, ...DEFAULT_API_FALLBACKS]
      .flatMap((url) => withIndexPhpFallback(url))
      .filter((url) => /^https?:\/\//i.test(url))
  )
);

export const MOBILE_DEVICE_NAME = process.env.EXPO_PUBLIC_DEVICE_NAME?.trim() || "mobile-app";
export const GOOGLE_EXPO_CLIENT_ID = readPublicEnv("EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID");
export const GOOGLE_ANDROID_CLIENT_ID = readPublicEnv("EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID");
export const GOOGLE_IOS_CLIENT_ID = readPublicEnv("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID");
export const GOOGLE_WEB_CLIENT_ID = readPublicEnv("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID");
export const GOOGLE_LOGIN_ENABLED =
  GOOGLE_EXPO_CLIENT_ID !== "" ||
  GOOGLE_ANDROID_CLIENT_ID !== "" ||
  GOOGLE_IOS_CLIENT_ID !== "" ||
  GOOGLE_WEB_CLIENT_ID !== "";
