import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/ipc';

const FALLBACK: AppSettings = { theme: 'system', weekStartsOn: 1, habitsView: 'today' };

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void window.api.settings.get().then((saved) => {
      setSettings(saved);
      setLoaded(true);
    });
  }, []);

  /** Applies the change on screen straight away, then saves it and keeps what main returns. */
  async function update(changes: Partial<AppSettings>) {
    setSettings((current) => ({ ...current, ...changes }));
    try {
      setSettings(await window.api.settings.update(changes));
    } catch (error) {
      setSettings(await window.api.settings.get());
      throw error;
    }
  }

  return { settings, loaded, update };
}
