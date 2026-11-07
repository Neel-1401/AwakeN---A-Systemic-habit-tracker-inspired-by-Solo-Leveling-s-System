import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/ipc';

const FALLBACK: AppSettings = { theme: 'system', weekStartsOn: 1 };

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void window.api.settings.get().then((saved) => {
      setSettings(saved);
      setLoaded(true);
    });
  }, []);

  async function update(changes: Partial<AppSettings>) {
    setSettings(await window.api.settings.update(changes));
  }

  return { settings, loaded, update };
}
