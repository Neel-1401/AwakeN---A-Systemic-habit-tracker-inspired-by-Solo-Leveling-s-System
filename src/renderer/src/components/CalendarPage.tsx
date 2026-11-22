import { addDays, addMonths, format, getMonth, getYear, isSameMonth, isSameYear, startOfMonth, startOfWeek } from 'date-fns';
import { useState } from 'react';
import { monthWeeks } from '../../../core/calendar';
import { parseDay, toDay, type WeekStartsOn } from '../../../core/dates';
import { eventToForm, newAllDayForm, newEventForm, type EventForm } from '../../../core/eventForm';
import type { CalendarEvent } from '../../../core/types';
import type { EventOccurrenceDto } from '../../../shared/ipc';
import { useEvents } from '../hooks/useEvents';
import { useNow } from '../hooks/useNow';
import { useShortcuts } from '../hooks/useShortcuts';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { errorMessage } from '../lib/format';
import { CalendarMonth } from './CalendarMonth';
import { EventDialog } from './EventDialog';
import { PeriodToolbar } from './PeriodToolbar';
import { FailedSyncDialog, SyncIndicator } from './SyncStatus';
import { panelId, tabId, Tabs } from './Tabs';
import { TimeGrid } from './TimeGrid';

type CalendarView = 'day' | 'week' | 'month';

const VIEW_TABS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const satisfies readonly { value: CalendarView; label: string }[];

/**
 * null: closed. Otherwise the form to start from, plus the stored event when editing.
 * `opened` gives each opening its own React key, so a new dialog never keeps an old one's fields.
 */
type DialogState = null | { form: EventForm; event?: CalendarEvent; opened: number };

interface CalendarPageProps {
  weekStartsOn: WeekStartsOn;
  /** "Needs reconnect" in the sync status goes to Settings. */
  onOpenSettings(): void;
}

/** "9 – 15 November 2026", "30 Nov – 6 Dec 2026" or "28 Dec 2026 – 3 Jan 2027". */
function weekLabel(first: Date, last: Date): string {
  if (isSameMonth(first, last)) return `${format(first, 'd')} – ${format(last, 'd MMMM yyyy')}`;
  if (isSameYear(first, last)) return `${format(first, 'd MMM')} – ${format(last, 'd MMM yyyy')}`;
  return `${format(first, 'd MMM yyyy')} – ${format(last, 'd MMM yyyy')}`;
}

export function CalendarPage({ weekStartsOn, onOpenSettings }: CalendarPageProps) {
  const now = useNow();
  const today = toDay(now);
  const [view, setView] = useState<CalendarView>('week');
  // The day the view is built around: Week shows the week containing it, Month its month.
  const [anchor, setAnchor] = useState(today);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFailed, setShowFailed] = useState(false);
  const sync = useSyncStatus();
  const open = (form: EventForm, event?: CalendarEvent) => setDialog({ form, event, opened: Date.now() });

  const anchorDate = parseDay(anchor);
  // Month view also shows the edges of the neighbouring months, so it loads those days too.
  const weeks =
    view === 'month' ? monthWeeks(getYear(anchorDate), getMonth(anchorDate) + 1, weekStartsOn) : null;
  const days = weeks
    ? weeks.flat()
    : view === 'week'
      ? Array.from({ length: 7 }, (_, i) => toDay(addDays(startOfWeek(anchorDate, { weekStartsOn }), i)))
      : [anchor];
  // The first day of the period itself (the 1st, for a month).
  const periodStart = view === 'month' ? toDay(startOfMonth(anchorDate)) : days[0];
  const showsToday = view === 'month' ? isSameMonth(anchorDate, now) : days.includes(today);
  const data = useEvents(days[0], days[days.length - 1]);

  async function attempt(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const move = (delta: number) =>
    setAnchor((day) => {
      const date = parseDay(day);
      if (view === 'month') return toDay(addMonths(date, delta));
      return toDay(addDays(date, delta * (view === 'week' ? 7 : 1)));
    });

  const label =
    view === 'month' ? format(anchorDate, 'MMMM yyyy')
    : view === 'week' ? weekLabel(parseDay(days[0]), parseDay(days[6]))
    : format(anchorDate, 'EEEE d MMMM yyyy');

  const showDay = (day: string) => {
    setAnchor(day);
    setView('day');
  };

  /** New event at the next whole hour: today if it's in view, otherwise the period's first day. */
  function newEvent() {
    const start = parseDay(view === 'day' ? anchor : showsToday ? today : periodStart);
    start.setHours(Math.min(23, now.getHours() + 1));
    open(newEventForm(start));
  }

  // React adds the key listener while this page is shown and removes it when you leave.
  useShortcuts({
    t: () => setAnchor(today),
    j: () => move(1),
    k: () => move(-1),
    ArrowRight: () => move(1),
    ArrowLeft: () => move(-1),
    d: () => setView('day'),
    w: () => setView('week'),
    m: () => setView('month'),
    n: newEvent,
  });

  const openOccurrence = (occurrence: EventOccurrenceDto) =>
    open(eventToForm(occurrence.event), occurrence.event);
  const toggleTask = (occurrence: EventOccurrenceDto) =>
    attempt(() => data.toggleTask(occurrence));

  return (
    <>
      <header className="page-header">
        <p className="page-header__date">{format(now, 'EEEE d MMMM yyyy')}</p>
        <h1 className="page-header__title">Calendar</h1>
      </header>

      <div className="page-bar">
        <Tabs<CalendarView> idPrefix="calendar" label="Calendar views" tabs={VIEW_TABS} value={view} onChange={setView} />
        <div className="page-bar__actions">
          {sync && (
            <SyncIndicator
              status={sync}
              now={now}
              onShowFailed={() => setShowFailed(true)}
              onOpenSettings={onOpenSettings}
            />
          )}
          <button type="button" className="button button--primary" aria-keyshortcuts="N" onClick={newEvent}>
            New event
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="button button--quiet" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div id={panelId('calendar')} role="tabpanel" aria-labelledby={tabId('calendar', view)} className="fade-in">
        <PeriodToolbar
          label={label}
          unit={view}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
          resetLabel="Today"
          onReset={showsToday ? undefined : () => setAnchor(today)}
        >
          <span aria-label="Shortcuts: T today, J and K next and previous, D, W and M change the view, N new event">
            <kbd>T</kbd> today · <kbd>J</kbd> <kbd>K</kbd> next/previous · <kbd>D</kbd> <kbd>W</kbd> <kbd>M</kbd>{' '}
            views · <kbd>N</kbd> new
          </span>
        </PeriodToolbar>

        {data.occurrences?.length === 0 && (
          <p className="note calendar-empty">
            Nothing on this {view} yet. Click an empty spot, or press <kbd>N</kbd>, to add an event or task.
          </p>
        )}

        {weeks ? (
          <CalendarMonth
            weeks={weeks}
            month={getMonth(anchorDate) + 1}
            today={today}
            occurrences={data.occurrences ?? []}
            onPickDay={showDay}
            onCreateOn={(day) => {
              const start = parseDay(day);
              start.setHours(9);
              open(newEventForm(start));
            }}
            onOpen={openOccurrence}
            onToggleTask={toggleTask}
          />
        ) : (
          <TimeGrid
            days={days}
            today={today}
            now={now}
            occurrences={data.occurrences ?? []}
            onPickDay={view === 'week' ? showDay : undefined}
            onCreateAt={(start) => open(newEventForm(start))}
            onCreateAllDay={(day) => open(newAllDayForm(day))}
            onOpen={openOccurrence}
            onToggleTask={toggleTask}
          />
        )}
      </div>

      {showFailed && sync && <FailedSyncDialog status={sync} onClose={() => setShowFailed(false)} />}

      {dialog && (
        <EventDialog
          key={dialog.opened}
          initial={dialog.form}
          event={dialog.event}
          onClose={() => setDialog(null)}
          onSave={(input) => (dialog.event ? data.update(dialog.event.id, input) : data.create(input))}
          onDelete={(id) => data.remove(id)}
        />
      )}
    </>
  );
}
