import { APP_VERSION } from "../../config/appVersion";
import { fetchLatestAndroidAppRelease, type AndroidAppRelease } from "./updateApi";
import { compareAppVersions } from "./versioning";

export type AndroidUpdateStatus = "current" | "available" | "required";

export interface AndroidUpdateCheckResult {
  status: AndroidUpdateStatus;
  currentVersion: string;
  latestVersion: string;
  minimumSupportedVersion: string | null;
  release: AndroidAppRelease;
}

export async function checkAndroidAppUpdate(): Promise<AndroidUpdateCheckResult> {
  const release = await fetchLatestAndroidAppRelease();
  const latestVersion = release.version.trim();
  const minimumSupportedVersion = release.minimum_supported_version?.trim() || null;
  const hasNewerVersion = compareAppVersions(APP_VERSION, latestVersion) < 0;
  const updateRequired = minimumSupportedVersion ? compareAppVersions(APP_VERSION, minimumSupportedVersion) < 0 : false;

  return {
    status: updateRequired ? "required" : hasNewerVersion ? "available" : "current",
    currentVersion: APP_VERSION,
    latestVersion,
    minimumSupportedVersion,
    release,
  };
}

export function resolveAndroidUpdateUrl(release: AndroidAppRelease): string | null {
  const primaryUrl = release.download_url || release.page_url;
  const normalized = primaryUrl?.trim() || "";

  return normalized.length > 0 ? normalized : null;
}
