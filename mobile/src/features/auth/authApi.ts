import { httpClient } from "../../lib/httpClient";
import type { LoginResponse, MeResponse } from "../../types/auth";

interface LoginPayload {
  email: string;
  password: string;
  deviceName: string;
}

export async function loginWithEmailPassword(payload: LoginPayload): Promise<LoginResponse> {
  const response = await httpClient.post<LoginResponse>("/auth/login", {
    email: payload.email,
    password: payload.password,
    device_name: payload.deviceName,
  });

  return response.data;
}

export async function fetchMeContext(): Promise<MeResponse> {
  const response = await httpClient.get<MeResponse>("/me");
  return response.data;
}

export async function logoutCurrentSession(): Promise<void> {
  await httpClient.post("/auth/logout");
}

export async function checkApiHealth(): Promise<{ ok: boolean; time?: string }> {
  const response = await httpClient.get<{ ok: boolean; time?: string }>("/health");
  return response.data;
}
