import Constants from "expo-constants";

const appConfig = require("../../app.json")?.expo ?? {};

function normalizeVersion(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const nativeVersion = normalizeVersion(Constants.nativeApplicationVersion);
const expoConfigVersion = normalizeVersion(Constants.expoConfig?.version);
const appConfigVersion = normalizeVersion(appConfig.version);

export const APP_VERSION: string = nativeVersion || expoConfigVersion || appConfigVersion || "1.0.0";
