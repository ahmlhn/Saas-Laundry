import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL, API_BASE_URL_CANDIDATES } from "../config/env";

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _apiFallbackTried?: string[];
}

let activeApiBaseUrl = API_BASE_URL;

function buildApiBaseUrl(baseUrl: string): string {
  return `${baseUrl}/api`;
}

function normalizeCandidateFromBaseUrl(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
}

function setActiveApiBaseUrl(baseUrl: string): void {
  activeApiBaseUrl = baseUrl;
  httpClient.defaults.baseURL = buildApiBaseUrl(baseUrl);
}

function getNextCandidate(tried: Set<string>): string | null {
  for (const candidate of API_BASE_URL_CANDIDATES) {
    if (!tried.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

export const httpClient = axios.create({
  baseURL: buildApiBaseUrl(activeApiBaseUrl),
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Source-Channel": "mobile",
  },
});

httpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || error.response || !error.config) {
      throw error;
    }

    const requestConfig = error.config as RetryableRequestConfig;
    const tried = new Set<string>(requestConfig._apiFallbackTried ?? []);
    const currentCandidate = normalizeCandidateFromBaseUrl(requestConfig.baseURL || httpClient.defaults.baseURL);

    if (currentCandidate) {
      tried.add(currentCandidate);
    } else {
      tried.add(activeApiBaseUrl);
    }

    const nextCandidate = getNextCandidate(tried);
    if (!nextCandidate) {
      throw error;
    }

    const nextConfig: RetryableRequestConfig = {
      ...requestConfig,
      _apiFallbackTried: [...tried, nextCandidate],
      baseURL: buildApiBaseUrl(nextCandidate),
    };

    try {
      const response = await httpClient.request(nextConfig);
      setActiveApiBaseUrl(nextCandidate);
      return response;
    } catch (nextError) {
      throw nextError;
    }
  }
);

export function setAuthBearerToken(token: string | null): void {
  if (!token) {
    delete httpClient.defaults.headers.common.Authorization;
    return;
  }

  httpClient.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function getActiveApiBaseUrl(): string {
  return activeApiBaseUrl;
}

export function getApiBaseCandidates(): string[] {
  return API_BASE_URL_CANDIDATES;
}

export function getApiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "Terjadi kesalahan yang tidak diketahui.";
  }

  if (!error.response) {
    const code = error.code ?? "ERR_NETWORK";
    const reason = getNetworkReasonLabel(code, error.message);
    const tips = getApiSetupChecklist();

    return [
      `Network error (${code}). Tidak bisa menghubungi API.`,
      `API aktif: ${getActiveApiBaseUrl()}`,
      `Kandidat URL: ${getApiBaseCandidates().join(", ")}`,
      `Keterangan: ${reason}`,
      "Checklist:",
      ...tips.map((tip, index) => `${index + 1}. ${tip}`),
    ].join("\n");
  }

  if (error.response.status >= 500) {
    return [
      `Server error (${error.response.status}) dari API.`,
      `API aktif: ${getActiveApiBaseUrl()}`,
      "Keterangan: API reachable, tetapi backend gagal memproses request.",
      "Cek service backend, log Laravel, dan versi PHP runtime backend.",
    ].join("\n");
  }

  const payload = error.response?.data;

  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;

    if (typeof data.message === "string" && data.message.trim().length > 0) {
      return data.message;
    }

    if (typeof data.reason_code === "string") {
      return data.reason_code;
    }
  }

  if (error.message) {
    return error.message;
  }

  return "Gagal memproses permintaan.";
}

function getNetworkReasonLabel(code: string, fallbackMessage?: string): string {
  if (code === "ENOTFOUND") {
    return "Domain API tidak ditemukan (DNS error).";
  }

  if (code === "ECONNREFUSED") {
    return "Koneksi ditolak. Service API belum jalan atau port salah.";
  }

  if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return "Request timeout. Server tidak merespons tepat waktu.";
  }

  if (code === "ERR_NETWORK") {
    return "Aplikasi tidak bisa membuka koneksi jaringan ke API.";
  }

  return fallbackMessage?.trim() || "Gangguan jaringan tidak terklasifikasi.";
}

export function getApiSetupChecklist(): string[] {
  const lower = getActiveApiBaseUrl().toLowerCase();

  if (lower.includes("127.0.0.1") || lower.includes("localhost")) {
    return [
      "Jika pakai Android emulator, gunakan http://10.0.2.2:8000.",
      "Jika pakai iOS simulator, 127.0.0.1 biasanya valid.",
      "Jika pakai device fisik, gunakan IP LAN mesin backend (contoh http://192.168.x.x:8000).",
      "Pastikan backend Laravel listen di 0.0.0.0:8000.",
    ];
  }

  if (lower.startsWith("https://")) {
    return [
      "Pastikan domain HTTPS aktif dan bisa di-resolve dari device.",
      "Pastikan path /api/health merespons JSON dari backend.",
      "Jika domain tunnel dinamis (mis. Cloudflare), update EXPO_PUBLIC_API_URL saat domain berubah.",
    ];
  }

  return [
    "Pastikan EXPO_PUBLIC_API_URL menunjuk endpoint backend yang benar.",
    "Pastikan backend Laravel aktif dan dapat diakses dari emulator/device.",
    "Untuk Android emulator, fallback ke http://10.0.2.2:8000 biasanya paling stabil.",
  ];
}
