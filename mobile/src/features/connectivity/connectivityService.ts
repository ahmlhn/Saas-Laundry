import NetInfo from "@react-native-community/netinfo";

export interface ConnectivitySnapshot {
  hasResolvedState: boolean;
  isOnline: boolean;
  isOffline: boolean;
}

let connectivitySnapshot: ConnectivitySnapshot = {
  hasResolvedState: false,
  isOnline: false,
  isOffline: false,
};

export function setConnectivitySnapshot(next: ConnectivitySnapshot): void {
  connectivitySnapshot = next;
}

export function getConnectivitySnapshot(): ConnectivitySnapshot {
  return connectivitySnapshot;
}

export function isConnectivityOnline(): boolean {
  return connectivitySnapshot.isOnline;
}

export async function refreshConnectivitySnapshot(): Promise<ConnectivitySnapshot> {
  const nextState = await NetInfo.fetch();
  const hasResolvedState = nextState.isConnected !== null || nextState.isInternetReachable !== null;
  const isOnline = nextState.isConnected === true && nextState.isInternetReachable !== false;

  const snapshot: ConnectivitySnapshot = {
    hasResolvedState,
    isOnline,
    isOffline: hasResolvedState && !isOnline,
  };

  setConnectivitySnapshot(snapshot);
  return snapshot;
}
