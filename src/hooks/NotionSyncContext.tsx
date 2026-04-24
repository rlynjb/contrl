import { createContext, useContext, useCallback, useRef, useState, useEffect, type ReactNode } from 'react';
import { syncAll } from '../services/notion/sync';
import { isNotionConfigured, getLastSyncTimestamp } from '../services/notion/config';
import type { SyncResult, SyncStatus } from '../types/notion';

type NotionSyncContextType = {
  status: SyncStatus;
  lastSynced: string | null;
  result: SyncResult | null;
  configured: boolean;
  /** Increments after each successful sync — use as a dependency to refresh data */
  syncVersion: number;
  syncNow: () => Promise<SyncResult | null>;
  refresh: () => Promise<void>;
};

const NotionSyncContext = createContext<NotionSyncContextType>({
  status: 'idle',
  lastSynced: null,
  result: null,
  configured: false,
  syncVersion: 0,
  syncNow: async () => null,
  refresh: async () => {},
});

export function NotionSyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [configured, setConfigured] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    isNotionConfigured().then(setConfigured);
    getLastSyncTimestamp().then(setLastSynced);
  }, []);

  // Stable identity: re-entrancy is guarded by a ref so `syncNow`
  // does not change on every status transition. Callers can safely
  // depend on it from effects without causing sync loops.
  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    if (inFlightRef.current) return null;
    inFlightRef.current = true;
    setStatus('syncing');
    setResult(null);
    try {
      const res = await syncAll();
      setStatus(res.errors.length > 0 ? 'error' : 'success');
      setResult(res);
      setLastSynced(new Date().toISOString());
      setSyncVersion(v => v + 1);
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setResult({ pulled: 0, pushed: 0, errors: [msg], debug: [] });
      return null;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const refresh = useCallback(async () => {
    setConfigured(await isNotionConfigured());
    setLastSynced(await getLastSyncTimestamp());
  }, []);

  return (
    <NotionSyncContext.Provider value={{ status, lastSynced, result, configured, syncVersion, syncNow, refresh }}>
      {children}
    </NotionSyncContext.Provider>
  );
}

export function useNotionSync() {
  return useContext(NotionSyncContext);
}
