import { useState } from 'react';
import { HabitsPage } from './components/HabitsPage';
import { SettingsPage } from './components/SettingsPage';
import { Sidebar, type Page } from './components/Sidebar';
import { useSettings } from './hooks/useSettings';
import './App.css';

export default function App() {
  const [page, setPage] = useState<Page>('habits');
  const { settings, loaded, update } = useSettings();

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="app__main">
        <div className="app__content">
          {/* Wait for settings so the week doesn't briefly start on the wrong day. */}
          {loaded && page === 'habits' && <HabitsPage weekStartsOn={settings.weekStartsOn} />}
          {loaded && page === 'settings' && <SettingsPage settings={settings} onChange={update} />}
        </div>
      </main>
    </div>
  );
}
