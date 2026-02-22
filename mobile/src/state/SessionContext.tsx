import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { MOBILE_DEVICE_NAME } from "../config/env";
import { fetchMeContext, loginWithCredential, loginWithGoogleIdToken, logoutCurrentSession, registerAccount } from "../features/auth/authApi";
import { authenticateWithBiometric, getBiometricAvailability } from "../lib/biometricAuth";
import { setAuthBearerToken } from "../lib/httpClient";
import {
  clearStoredAccessToken,
  clearStoredSelectedOutletId,
  getStoredAccessToken,
  getStoredBiometricEnabled,
  getStoredSelectedOutletId,
  setStoredAccessToken,
  setStoredBiometricEnabled,
  setStoredSelectedOutletId,
} from "../lib/secureTokenStorage";
import type { AllowedOutlet, UserContext } from "../types/auth";

interface LoginInput {
  login: string;
  password: string;
}

interface GoogleLoginInput {
  idToken: string;
}

interface RegisterInput {
  name: string;
  tenantName: string;
  outletName?: string;
  email: string;
  phone?: string;
  password: string;
  passwordConfirmation: string;
}

interface SessionContextValue {
  booting: boolean;
  session: UserContext | null;
  selectedOutlet: AllowedOutlet | null;
  hasStoredSession: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  biometricLabel: string;
  login: (input: LoginInput) => Promise<void>;
  loginWithGoogle: (input: GoogleLoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  biometricLogin: () => Promise<void>;
  logout: () => Promise<void>;
  selectOutlet: (outlet: AllowedOutlet | null) => void;
  refreshSession: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function reconcileSelectedOutlet(
  session: UserContext,
  options: {
    preferredOutletId?: string | null;
    previousOutlet?: AllowedOutlet | null;
  }
): AllowedOutlet | null {
  const preferredOutletId = options.preferredOutletId?.trim();
  if (preferredOutletId) {
    const byPreferredId = session.allowed_outlets.find((outlet) => outlet.id === preferredOutletId);
    if (byPreferredId) {
      return byPreferredId;
    }
  }

  const previousOutlet = options.previousOutlet ?? null;
  if (previousOutlet) {
    const match = session.allowed_outlets.find((outlet) => outlet.id === previousOutlet.id);
    if (match) {
      return match;
    }
  }

  if (session.allowed_outlets.length === 1) {
    return session.allowed_outlets[0];
  }

  return null;
}

async function persistSelectedOutlet(outlet: AllowedOutlet | null): Promise<void> {
  if (!outlet) {
    await clearStoredSelectedOutletId();
    return;
  }

  await setStoredSelectedOutletId(outlet.id);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<UserContext | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<AllowedOutlet | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometrik");

  useEffect(() => {
    void bootstrapSession();
  }, []);

  async function bootstrapSession(): Promise<void> {
    setBooting(true);

    const [token, preferredOutletId, storedBiometricEnabled, biometricAvailability] = await Promise.all([
      getStoredAccessToken(),
      getStoredSelectedOutletId(),
      getStoredBiometricEnabled(),
      getBiometricAvailability(),
    ]);

    setBiometricAvailable(biometricAvailability.isSupported);
    setBiometricLabel(biometricAvailability.label);
    setBiometricEnabledState(storedBiometricEnabled && biometricAvailability.isSupported);

    if (!token) {
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
      setHasStoredSession(false);
      await clearStoredSelectedOutletId();
      setBooting(false);
      return;
    }

    setHasStoredSession(true);

    if (storedBiometricEnabled && biometricAvailability.isSupported) {
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
      setBooting(false);
      return;
    }

    setAuthBearerToken(token);

    try {
      const response = await fetchMeContext();
      const nextSelectedOutlet = reconcileSelectedOutlet(response.data, {
        preferredOutletId,
        previousOutlet: selectedOutlet,
      });

      setSession(response.data);
      setSelectedOutlet(nextSelectedOutlet);
      await persistSelectedOutlet(nextSelectedOutlet);
    } catch {
      await Promise.all([clearStoredAccessToken(), clearStoredSelectedOutletId()]);
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
      setHasStoredSession(false);
    } finally {
      setBooting(false);
    }
  }

  async function refreshSession(): Promise<void> {
    if (!session) {
      return;
    }

    const [response, preferredOutletId] = await Promise.all([fetchMeContext(), getStoredSelectedOutletId()]);
    const nextSelectedOutlet = reconcileSelectedOutlet(response.data, {
      preferredOutletId,
      previousOutlet: selectedOutlet,
    });

    setSession(response.data);
    setSelectedOutlet(nextSelectedOutlet);
    await persistSelectedOutlet(nextSelectedOutlet);
  }

  async function login(input: LoginInput): Promise<void> {
    const response = await loginWithCredential({
      login: input.login.trim(),
      password: input.password,
      deviceName: MOBILE_DEVICE_NAME,
    });

    await setStoredAccessToken(response.access_token);
    setAuthBearerToken(response.access_token);
    setHasStoredSession(true);

    const preferredOutletId = await getStoredSelectedOutletId();
    const nextSelectedOutlet = reconcileSelectedOutlet(response.data, {
      preferredOutletId,
      previousOutlet: selectedOutlet,
    });

    setSession(response.data);
    setSelectedOutlet(nextSelectedOutlet);
    await persistSelectedOutlet(nextSelectedOutlet);
  }

  async function loginWithGoogle(input: GoogleLoginInput): Promise<void> {
    const response = await loginWithGoogleIdToken({
      idToken: input.idToken,
      deviceName: MOBILE_DEVICE_NAME,
    });

    await setStoredAccessToken(response.access_token);
    setAuthBearerToken(response.access_token);
    setHasStoredSession(true);

    const preferredOutletId = await getStoredSelectedOutletId();
    const nextSelectedOutlet = reconcileSelectedOutlet(response.data, {
      preferredOutletId,
      previousOutlet: selectedOutlet,
    });

    setSession(response.data);
    setSelectedOutlet(nextSelectedOutlet);
    await persistSelectedOutlet(nextSelectedOutlet);
  }

  async function register(input: RegisterInput): Promise<void> {
    const response = await registerAccount({
      name: input.name.trim(),
      tenantName: input.tenantName.trim(),
      outletName: input.outletName?.trim() || undefined,
      email: input.email.trim(),
      phone: input.phone?.trim() || undefined,
      password: input.password,
      passwordConfirmation: input.passwordConfirmation,
      deviceName: MOBILE_DEVICE_NAME,
    });

    await setStoredAccessToken(response.access_token);
    setAuthBearerToken(response.access_token);
    setHasStoredSession(true);

    const preferredOutletId = await getStoredSelectedOutletId();
    const nextSelectedOutlet = reconcileSelectedOutlet(response.data, {
      preferredOutletId,
      previousOutlet: selectedOutlet,
    });

    setSession(response.data);
    setSelectedOutlet(nextSelectedOutlet);
    await persistSelectedOutlet(nextSelectedOutlet);
  }

  async function biometricLogin(): Promise<void> {
    if (!biometricAvailable || !biometricEnabled) {
      throw new Error("Biometrik belum aktif di perangkat ini.");
    }

    const token = await getStoredAccessToken();
    if (!token) {
      throw new Error("Sesi login tidak ditemukan. Silakan login dengan email/nomor HP dan kata sandi.");
    }

    await authenticateWithBiometric(`Verifikasi ${biometricLabel} untuk masuk`);
    setAuthBearerToken(token);

    const [response, preferredOutletId] = await Promise.all([fetchMeContext(), getStoredSelectedOutletId()]);
    const nextSelectedOutlet = reconcileSelectedOutlet(response.data, {
      preferredOutletId,
      previousOutlet: selectedOutlet,
    });

    setSession(response.data);
    setSelectedOutlet(nextSelectedOutlet);
    setHasStoredSession(true);
    await persistSelectedOutlet(nextSelectedOutlet);
  }

  async function setBiometricEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const availability = await getBiometricAvailability();
      if (!availability.isSupported) {
        throw new Error("Perangkat tidak mendukung autentikasi biometrik.");
      }

      await authenticateWithBiometric("Konfirmasi aktivasi login biometrik");
      await setStoredBiometricEnabled(true);
      setBiometricAvailable(true);
      setBiometricLabel(availability.label);
      setBiometricEnabledState(true);
      return;
    }

    await setStoredBiometricEnabled(false);
    setBiometricEnabledState(false);
  }

  async function logout(): Promise<void> {
    try {
      await logoutCurrentSession();
    } catch {
      // best effort: sesi lokal tetap dibersihkan.
    } finally {
      await Promise.all([clearStoredAccessToken(), clearStoredSelectedOutletId()]);
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
      setHasStoredSession(false);
    }
  }

  function selectOutlet(outlet: AllowedOutlet | null): void {
    setSelectedOutlet(outlet);
    void persistSelectedOutlet(outlet);
  }

  const value = useMemo<SessionContextValue>(
    () => ({
      booting,
      session,
      selectedOutlet,
      hasStoredSession,
      biometricAvailable,
      biometricEnabled,
      biometricLabel,
      login,
      loginWithGoogle,
      register,
      biometricLogin,
      logout,
      selectOutlet,
      refreshSession,
      setBiometricEnabled,
    }),
    [booting, session, selectedOutlet, hasStoredSession, biometricAvailable, biometricEnabled, biometricLabel]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return context;
}
