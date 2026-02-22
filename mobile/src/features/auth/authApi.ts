import { httpClient } from "../../lib/httpClient";
import type { LoginResponse, MeResponse } from "../../types/auth";

interface LoginPayload {
  login: string;
  password: string;
  deviceName: string;
}

interface RegisterPayload {
  name: string;
  tenantName: string;
  outletName?: string;
  email: string;
  phone?: string;
  password: string;
  passwordConfirmation: string;
  deviceName: string;
}

export async function loginWithCredential(payload: LoginPayload): Promise<LoginResponse> {
  const response = await httpClient.post<LoginResponse>("/auth/login", {
    login: payload.login,
    password: payload.password,
    device_name: payload.deviceName,
  });

  return response.data;
}

export async function registerAccount(payload: RegisterPayload): Promise<LoginResponse> {
  const response = await httpClient.post<LoginResponse>("/auth/register", {
    name: payload.name,
    tenant_name: payload.tenantName,
    outlet_name: payload.outletName,
    email: payload.email,
    phone: payload.phone,
    password: payload.password,
    password_confirmation: payload.passwordConfirmation,
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
