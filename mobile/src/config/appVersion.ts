import Constants from "expo-constants";

const appConfig = require("../../app.json")?.expo ?? {};

function normalizeVersion(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBuild(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

const nativeVersion = normalizeVersion(Constants.nativeApplicationVersion);
const expoConfigVersion = normalizeVersion(Constants.expoConfig?.version);
const appConfigVersion = normalizeVersion(appConfig.version);
const nativeBuild = normalizeBuild(Constants.nativeBuildVersion);
const expoConfigBuild = normalizeBuild(Constants.expoConfig?.android?.versionCode);
const appConfigBuild = normalizeBuild(appConfig.android?.versionCode);

export const APP_VERSION: string = nativeVersion || expoConfigVersion || appConfigVersion || "1.0.0";
export const APP_BUILD: number | null = nativeBuild ?? expoConfigBuild ?? appConfigBuild;
