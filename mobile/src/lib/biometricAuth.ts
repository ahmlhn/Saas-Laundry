import * as LocalAuthentication from "expo-local-authentication";

export interface BiometricAvailability {
  isSupported: boolean;
  isEnrolled: boolean;
  label: string;
}

function resolveTypeLabel(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "Face ID";
  }

  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "Sidik Jari";
  }

  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "Iris";
  }

  return "Biometrik";
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
  const supportedTypes = hasHardware ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];

  return {
    isSupported: hasHardware && isEnrolled,
    isEnrolled,
    label: resolveTypeLabel(supportedTypes),
  };
}

export async function authenticateWithBiometric(promptMessage: string): Promise<void> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "Gunakan PIN",
    cancelLabel: "Batal",
    disableDeviceFallback: false,
  });

  if (result.success) {
    return;
  }

  if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") {
    throw new Error("Autentikasi biometrik dibatalkan.");
  }

  if (result.error === "not_enrolled") {
    throw new Error("Perangkat belum memiliki biometrik aktif.");
  }

  throw new Error("Autentikasi biometrik gagal.");
}
