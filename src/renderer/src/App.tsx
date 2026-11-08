import { useEffect, useState } from 'react';
import { HabitsPage } from './components/HabitsPage';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar, type Page } from './components/Sidebar';
import { useSettings } from './hooks/useSettings';
import './App.css';

export default function App() {
  const [page, setPage] = useState<Page>('habits');
  const { settings, loaded, update } = useSettings();

  // When a reminder notification is clicked, main asks for the Today tab.
  // The effect returns the unsubscribe function, so React removes the listener on unmount.
  useEffect(
    () =>
      window.api.events.onShowToday(() => {
        setPage('habits');
        void update({ habitsView: 'today' }).catch(() => {});
      }),
    // Subscribe once. `update` only uses state setters and window.api, so the first copy is fine.
    []
  );

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="app__main">
        <div className="app__content">
          {/* Wait for settings so the week doesn't briefly start on the wrong day. */}
          {loaded && page === 'habits' && (
            <HabitsPage
              weekStartsOn={settings.weekStartsOn}
              view={settings.habitsView}
              onViewChange={(habitsView) => void update({ habitsView }).catch(() => {})}
            />
          )}
          {loaded && page === 'settings' && <SettingsPage settings={settings} onChange={update} />}
        </div>
      </main>
    </div>
  );
}
