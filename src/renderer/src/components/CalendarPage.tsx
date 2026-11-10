import { addDays, format, isSameMonth, isSameYear, startOfWeek } from 'date-fns';
import { useState } from 'react';
import { parseDay, toDay, type WeekStartsOn } from '../../../core/dates';
import { eventToForm, newAllDayForm, newEventForm, type EventForm } from '../../../core/eventForm';
import type { CalendarEvent } from '../../../core/types';
import { useEvents } from '../hooks/useEvents';
import { useNow } from '../hooks/useNow';
import { errorMessage } from '../lib/format';
import { EventDialog } from './EventDialog';
import { PeriodToolbar } from './PeriodToolbar';
import { panelId, tabId, Tabs } from './Tabs';
import { TimeGrid } from './TimeGrid';

type CalendarView = 'week' | 'day';

const VIEW_TABS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const satisfies readonly { value: CalendarView; label: string }[];

/**
 * null: closed. Otherwise the form to start from, plus the stored event when editing.
 * `opened` gives each opening its own React key, so a new dialog never keeps an old one's fields.
 */
type DialogState = null | { form: EventForm; event?: CalendarEvent; opened: number };

interface CalendarPageProps {
  weekStartsOn: WeekStartsOn;
}

/** "9 – 15 November 2026", "30 Nov – 6 Dec 2026" or "28 Dec 2026 – 3 Jan 2027". */
function weekLabel(first: Date, last: Date): string {
  if (isSameMonth(first, last)) return `${format(first, 'd')} – ${format(last, 'd MMMM yyyy')}`;
  if (isSameYear(first, last)) return `${format(first, 'd MMM')} – ${format(last, 'd MMM yyyy')}`;
  return `${format(first, 'd MMM yyyy')} – ${format(last, 'd MMM yyyy')}`;
}

export function CalendarPage({ weekStartsOn }: CalendarPageProps) {
  const now = useNow();
  const today = toDay(now);
  const [view, setView] = useState<CalendarView>('week');
  // The day the view is built around. Week shows the week containing it.
  const [anchor, setAnchor] = useState(today);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);
  const open = (form: EventForm, event?: CalendarEvent) => setDialog({ form, event, opened: Date.now() });

  const first = view === 'week' ? startOfWeek(parseDay(anchor), { weekStartsOn }) : parseDay(anchor);
  const days = Array.from({ length: view === 'week' ? 7 : 1 }, (_, i) => toDay(addDays(first, i)));
  const data = useEvents(days[0], days[days.length - 1]);

  async function attempt(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const step = view === 'week' ? 7 : 1;
  const move = (delta: number) => setAnchor((day) => toDay(addDays(parseDay(day), delta * step)));
  const label =
    view === 'week' ? weekLabel(first, parseDay(days[6])) : format(first, 'EEEE d MMMM yyyy');

  return (
    <>
      <header className="page-header">
        <p className="page-header__date">{format(now, 'EEEE d MMMM yyyy')}</p>
        <h1 className="page-header__title">Calendar</h1>
      </header>

      <div className="page-bar">
        <Tabs<CalendarView> idPrefix="calendar" label="Calendar views" tabs={VIEW_TABS} value={view} onChange={setView} />
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            // The next whole hour, on the day shown (Day), today (this week) or the week's first day.
            const day = view === 'day' ? anchor : days.includes(today) ? today : days[0];
            const start = parseDay(day);
            start.setHours(Math.min(23, now.getHours() + 1));
            open(newEventForm(start));
          }}
        >
          New event
        </button>
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
          onReset={days.includes(today) ? undefined : () => setAnchor(today)}
        >
          <span>Click an empty slot to add an event</span>
        </PeriodToolbar>

        <TimeGrid
          days={days}
          today={today}
          now={now}
          occurrences={data.occurrences ?? []}
          onPickDay={
            view === 'week'
              ? (day) => {
                  setAnchor(day);
                  setView('day');
                }
              : undefined
          }
          onCreateAt={(start) => open(newEventForm(start))}
          onCreateAllDay={(day) => open(newAllDayForm(day))}
          onOpen={(occurrence) => open(eventToForm(occurrence.event), occurrence.event)}
          onToggleTask={(occurrence) => attempt(() => data.toggleTask(occurrence))}
        />
      </div>

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
