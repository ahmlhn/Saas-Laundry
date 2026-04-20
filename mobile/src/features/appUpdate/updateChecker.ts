import { APP_BUILD, APP_VERSION } from "../../config/appVersion";
import { fetchLatestAndroidAppRelease, type AndroidAppRelease } from "./updateApi";
import { compareAppVersions } from "./versioning";

export type AndroidUpdateStatus = "current" | "available" | "required";

export interface AndroidUpdateCheckResult {
  status: AndroidUpdateStatus;
  currentVersion: string;
  currentBuild: number | null;
  latestVersion: string;
  latestBuild: number;
  minimumSupportedVersion: string | null;
  release: AndroidAppRelease;
}

export async function checkAndroidAppUpdate(): Promise<AndroidUpdateCheckResult> {
  const release = await fetchLatestAndroidAppRelease();
  const latestVersion = release.version.trim();
  const latestBuild = Math.max(1, release.build);
  const minimumSupportedVersion = release.minimum_supported_version?.trim() || null;
  const versionComparison = compareAppVersions(APP_VERSION, latestVersion);
  const hasNewerBuild = versionComparison === 0 && APP_BUILD !== null && APP_BUILD < latestBuild;
  const hasNewerVersion = versionComparison < 0 || hasNewerBuild;
  const minimumSupportedComparison = minimumSupportedVersion ? compareAppVersions(APP_VERSION, minimumSupportedVersion) : 1;
  const updateRequired =
    minimumSupportedVersion !== null
      ? minimumSupportedComparison < 0 || (minimumSupportedComparison === 0 && hasNewerBuild)
      : false;

  return {
    status: updateRequired ? "required" : hasNewerVersion ? "available" : "current",
    currentVersion: APP_VERSION,
    currentBuild: APP_BUILD,
    latestVersion,
    latestBuild,
    minimumSupportedVersion,
    release,
  };
}

export function resolveAndroidUpdateUrl(release: AndroidAppRelease): string | null {
  const primaryUrl = release.download_url || release.page_url;
  const normalized = primaryUrl?.trim() || "";

  return normalized.length > 0 ? normalized : null;
}
