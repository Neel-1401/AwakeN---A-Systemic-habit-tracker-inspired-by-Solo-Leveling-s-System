import { useRef, type KeyboardEvent } from 'react';
import './Tabs.css';

/** The id of one tab and of the panel the tabs control, for aria-labelledby / aria-controls. */
export const tabId = (prefix: string, value: string) => `${prefix}-tab-${value}`;
export const panelId = (prefix: string) => `${prefix}-panel`;

interface TabsProps<T extends string> {
  /** Makes the ids unique when more than one tab list exists, e.g. "habits" or "calendar". */
  idPrefix: string;
  label: string;
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
}

/**
 * Follows the standard tabs pattern: Tab moves into the tab list once, then Left/Right (and
 * Home/End) move between tabs and switch to them.
 */
export function Tabs<T extends string>({ idPrefix, label, tabs, value, onChange }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.value === value);
    const next =
      event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].value);
    listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div ref={listRef} className="tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            id={tabId(idPrefix, tab.value)}
            type="button"
            role="tab"
            className="tabs__tab"
            aria-selected={selected}
            aria-controls={panelId(idPrefix)}
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
