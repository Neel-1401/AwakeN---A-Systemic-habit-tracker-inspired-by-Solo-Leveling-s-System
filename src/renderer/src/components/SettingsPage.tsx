import { useState } from 'react';
import type { WeekStartsOn } from '../../../core/dates';
import type { AppSettings, ThemeSetting } from '../../../shared/ipc';
import { errorMessage } from '../lib/format';
import { SegmentedControl } from './SegmentedControl';

interface SettingsPageProps {
  settings: AppSettings;
  onChange(changes: Partial<AppSettings>): Promise<void>;
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemeSetting; label: string }[];

const WEEK_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 0, label: 'Sunday' },
] as const satisfies readonly { value: WeekStartsOn; label: string }[];

export function SettingsPage({ settings, onChange }: SettingsPageProps) {
  const [error, setError] = useState<string | null>(null);

  function change(changes: Partial<AppSettings>) {
    setError(null);
    onChange(changes).catch((caught) => setError(errorMessage(caught)));
  }

  return (
    <div className="fade-in">
      <header className="page-header">
        <h1 className="page-header__title">Settings</h1>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <section className="card" style={{ display: 'grid', gap: 'var(--space-5)', padding: 'var(--space-5)' }}>
        <SegmentedControl<ThemeSetting>
          legend="Theme"
          name="theme"
          value={settings.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => change({ theme })}
        />
        <SegmentedControl<WeekStartsOn>
          legend="Week starts on"
          name="week-start"
          value={settings.weekStartsOn}
          options={WEEK_OPTIONS}
          onChange={(weekStartsOn) => change({ weekStartsOn })}
        />
      </section>
    </div>
  );
}
