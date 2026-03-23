import NetInfo, { type NetInfoState, NetInfoStateType } from "@react-native-community/netinfo";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { setConnectivitySnapshot } from "./connectivityService";

interface ConnectivityContextValue {
  netInfo: NetInfoState;
  hasResolvedState: boolean;
  isOnline: boolean;
  isOffline: boolean;
  refresh: () => Promise<void>;
}

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

const initialNetInfoState: NetInfoState = {
  type: NetInfoStateType.unknown,
  isConnected: null,
  isInternetReachable: null,
  details: null,
};

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [netInfo, setNetInfo] = useState<NetInfoState>(initialNetInfoState);

  useEffect(() => {
    let active = true;

    const unsubscribe = NetInfo.addEventListener((nextState) => {
      if (active) {
        setNetInfo(nextState);
      }
    });

    void NetInfo.fetch().then((nextState) => {
      if (active) {
        setNetInfo(nextState);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<ConnectivityContextValue>(() => {
    const hasResolvedState = netInfo.isConnected !== null || netInfo.isInternetReachable !== null;
    const isOnline = netInfo.isConnected === true && netInfo.isInternetReachable !== false;

    return {
      netInfo,
      hasResolvedState,
      isOnline,
      isOffline: hasResolvedState && !isOnline,
      refresh: () => NetInfo.fetch().then((nextState) => setNetInfo(nextState)),
    };
  }, [netInfo]);

  useEffect(() => {
    setConnectivitySnapshot({
      hasResolvedState: value.hasResolvedState,
      isOnline: value.isOnline,
      isOffline: value.isOffline,
    });
  }, [value.hasResolvedState, value.isOffline, value.isOnline]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error("useConnectivity must be used within ConnectivityProvider");
  }

  return context;
}
