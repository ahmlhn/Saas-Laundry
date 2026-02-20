import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "saas_laundry_access_token";
const SELECTED_OUTLET_ID_KEY = "saas_laundry_selected_outlet_id";
const BIOMETRIC_ENABLED_KEY = "saas_laundry_biometric_enabled";

export async function getStoredAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearStoredAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export async function getStoredSelectedOutletId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SELECTED_OUTLET_ID_KEY);
  } catch {
    return null;
  }
}

export async function setStoredSelectedOutletId(outletId: string): Promise<void> {
  await SecureStore.setItemAsync(SELECTED_OUTLET_ID_KEY, outletId);
}

export async function clearStoredSelectedOutletId(): Promise<void> {
  await SecureStore.deleteItemAsync(SELECTED_OUTLET_ID_KEY);
}

export async function getStoredBiometricEnabled(): Promise<boolean> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}

export async function setStoredBiometricEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
    return;
  }

  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, "1");
}
