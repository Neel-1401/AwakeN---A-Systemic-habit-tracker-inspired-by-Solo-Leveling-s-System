import { useEffect, useState } from 'react';
import type { SyncStatus } from '../../../shared/ipc';

/** Push sync as main reports it. Main sends a new status whenever something changes. */
export function useSyncStatus(): SyncStatus | null {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    const unsubscribe = window.api.events.onSyncStatus(setStatus);
    void window.api.sync.getStatus().then(setStatus);
    return unsubscribe;
  }, []);
  return status;
}
