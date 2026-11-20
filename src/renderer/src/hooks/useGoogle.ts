import { useEffect, useState } from 'react';
import type { GoogleStatus } from '../../../shared/ipc';
import { errorMessage } from '../lib/format';

/** The Google connection for Settings. Main also pushes changes (e.g. a sign-in that expired). */
export function useGoogle() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = window.api.events.onGoogleStatus(setStatus);
    void window.api.google.getStatus().then(setStatus);
    return unsubscribe;
  }, []);

  /** Shows an IPC failure as a notice without changing the state. */
  function fail(caught: unknown) {
    setStatus((current) => (current ? { ...current, notice: errorMessage(caught) } : current));
  }

  return {
    status,
    busy,
    // Resolves when the browser sign-in finishes; 'connecting' arrives as a push meanwhile.
    connect: () => void window.api.google.connect().then(setStatus, fail),
    cancel: () => void window.api.google.cancelConnect().catch(fail),
    disconnect: () => {
      setBusy(true);
      window.api.google
        .disconnect()
        .then(setStatus, fail)
        .finally(() => setBusy(false));
    },
  };
}
