import { useRef, type KeyboardEvent } from 'react';
import type { HabitsView } from '../../../shared/ipc';
import './Tabs.css';

const TABS: { value: HabitsView; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export const tabId = (view: HabitsView) => `habits-tab-${view}`;
export const panelId = 'habits-panel';

interface TabsProps {
  value: HabitsView;
  onChange(view: HabitsView): void;
}

/**
 * Follows the standard tabs pattern: Tab moves into the tab list once, then Left/Right (and
 * Home/End) move between tabs and switch to them.
 */
export function Tabs({ value, onChange }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const index = TABS.findIndex((tab) => tab.value === value);
    const next =
      event.key === 'ArrowRight' ? (index + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (index - 1 + TABS.length) % TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? TABS.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    onChange(TABS[next].value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label="Habit views" onKeyDown={onKeyDown}>
      {TABS.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={tabId(tab.value)}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
