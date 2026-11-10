import { useEffect, useRef } from 'react';

/**
 * Single-key shortcuts for a page, e.g. { t: goToToday, n: newEvent }. Keys are matched on
 * event.key, lower-cased for letters ("ArrowLeft" stays as it is).
 *
 * Shortcuts are skipped while typing in a field, while a dialog is open, and when Ctrl/Alt/Cmd is
 * held, so they never steal normal keys. Arrow keys only count when nothing in particular has
 * focus, because tabs and grids use them to move focus.
 */
export function useShortcuts(handlers: Record<string, () => void>): void {
  // A ref always holds the latest handlers, so the listener is added once but never goes stale.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key.startsWith('Arrow') && target && target !== document.body) return;

      const handler = latest.current[key];
      if (!handler) return;
      event.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
