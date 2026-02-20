import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { MOBILE_DEVICE_NAME } from "../config/env";
import { fetchMeContext, loginWithEmailPassword, logoutCurrentSession } from "../features/auth/authApi";
import { setAuthBearerToken } from "../lib/httpClient";
import { clearStoredAccessToken, getStoredAccessToken, setStoredAccessToken } from "../lib/secureTokenStorage";
import type { AllowedOutlet, UserContext } from "../types/auth";

interface LoginInput {
  email: string;
  password: string;
}

interface SessionContextValue {
  booting: boolean;
  session: UserContext | null;
  selectedOutlet: AllowedOutlet | null;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  selectOutlet: (outlet: AllowedOutlet | null) => void;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function reconcileSelectedOutlet(session: UserContext, previousOutlet: AllowedOutlet | null): AllowedOutlet | null {
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<UserContext | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<AllowedOutlet | null>(null);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  async function bootstrapSession(): Promise<void> {
    setBooting(true);

    const token = await getStoredAccessToken();
    if (!token) {
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
      setBooting(false);
      return;
    }

    setAuthBearerToken(token);

    try {
      const response = await fetchMeContext();
      setSession(response.data);
      setSelectedOutlet((previousOutlet) => reconcileSelectedOutlet(response.data, previousOutlet));
    } catch {
      await clearStoredAccessToken();
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
    } finally {
      setBooting(false);
    }
  }

  async function refreshSession(): Promise<void> {
    if (!session) {
      return;
    }

    const response = await fetchMeContext();
    setSession(response.data);
    setSelectedOutlet((previousOutlet) => reconcileSelectedOutlet(response.data, previousOutlet));
  }

  async function login(input: LoginInput): Promise<void> {
    const response = await loginWithEmailPassword({
      email: input.email.trim(),
      password: input.password,
      deviceName: MOBILE_DEVICE_NAME,
    });

    await setStoredAccessToken(response.access_token);
    setAuthBearerToken(response.access_token);

    setSession(response.data);
    setSelectedOutlet((previousOutlet) => reconcileSelectedOutlet(response.data, previousOutlet));
  }

  async function logout(): Promise<void> {
    try {
      await logoutCurrentSession();
    } catch {
      // best effort: sesi lokal tetap dibersihkan.
    } finally {
      await clearStoredAccessToken();
      setAuthBearerToken(null);
      setSession(null);
      setSelectedOutlet(null);
    }
  }

  const value = useMemo<SessionContextValue>(
    () => ({
      booting,
      session,
      selectedOutlet,
      login,
      logout,
      selectOutlet: setSelectedOutlet,
      refreshSession,
    }),
    [booting, session, selectedOutlet]
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
