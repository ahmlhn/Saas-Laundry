import { httpClient } from "../../lib/httpClient";

export interface AndroidAppRelease {
  platform: "android";
  version: string;
  build: number;
  download_url: string | null;
  minimum_supported_version: string | null;
  published_at: string | null;
  checksum_sha256: string | null;
  file_size_bytes: number | null;
  notes: string[];
  page_url: string;
}

export async function fetchLatestAndroidAppRelease(): Promise<AndroidAppRelease> {
  const response = await httpClient.get<{ data: AndroidAppRelease }>("/mobile/releases/android/latest");
  return response.data.data;
}
