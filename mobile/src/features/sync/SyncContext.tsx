import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConnectivity } from "../connectivity/ConnectivityContext";
import { useSession } from "../../state/SessionContext";
import { syncPendingMutationsNow, type SyncExecutionResult } from "./syncCoordinator";
import { refreshOutboxTelemetrySnapshot } from "./outboxRepository";
import { readSyncStateSnapshot } from "./syncStateStorage";

interface SyncContextValue {
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingCount: number;
  rejectedCount: number;
  unsyncedCount: number;
  lastErrorMessage: string | null;
  syncNow: () => Promise<SyncExecutionResult | null>;
  refreshSnapshot: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { session, selectedOutlet } = useSession();
  const connectivity = useConnectivity();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const autoSyncKeyRef = useRef<string | null>(null);

  const refreshSnapshot = useCallback(async () => {
    await refreshOutboxTelemetrySnapshot();
    const snapshot = await readSyncStateSnapshot();
    setLastSyncAt(snapshot.lastSuccessfulSyncAt);
    setUnsyncedCount(snapshot.unsyncedCount);
    setRejectedCount(snapshot.rejectedCount);
    setPendingCount(Math.max(snapshot.unsyncedCount - snapshot.rejectedCount, 0));
  }, []);

  const syncNow = useCallback(async (): Promise<SyncExecutionResult | null> => {
    if (!session || !selectedOutlet?.id) {
      await refreshSnapshot();
      return null;
    }

    setIsSyncing(true);
    setLastErrorMessage(null);

    try {
      const result = await syncPendingMutationsNow({
        selectedOutletId: selectedOutlet.id,
      });
      await refreshSnapshot();
      if (result.pullErrorMessage) {
        setLastErrorMessage(result.pullErrorMessage);
      }
      return result;
    } catch (error) {
      setLastErrorMessage(error instanceof Error ? error.message : "Sinkronisasi gagal.");
      await refreshSnapshot();
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [refreshSnapshot, selectedOutlet?.id, session]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot, session?.user.id, selectedOutlet?.id]);

  useEffect(() => {
    if (!session || !selectedOutlet?.id || !connectivity.hasResolvedState || !connectivity.isOnline) {
      autoSyncKeyRef.current = null;
      return;
    }

    const nextKey = `${session.user.id}:${selectedOutlet.id}:${connectivity.isOnline ? "online" : "offline"}`;
    if (autoSyncKeyRef.current === nextKey) {
      return;
    }

    autoSyncKeyRef.current = nextKey;
    void syncNow().catch(() => undefined);
  }, [connectivity.hasResolvedState, connectivity.isOnline, selectedOutlet?.id, session, syncNow]);

  const value = useMemo<SyncContextValue>(
    () => ({
      isSyncing,
      lastSyncAt,
      pendingCount,
      rejectedCount,
      unsyncedCount,
      lastErrorMessage,
      syncNow,
      refreshSnapshot,
    }),
    [isSyncing, lastSyncAt, pendingCount, rejectedCount, unsyncedCount, lastErrorMessage, syncNow, refreshSnapshot]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within SyncProvider");
  }

  return context;
}
