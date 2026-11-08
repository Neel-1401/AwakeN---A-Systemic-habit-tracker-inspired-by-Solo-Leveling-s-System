import { addDays, endOfMonth, format } from 'date-fns';
import { useMemo, useState } from 'react';
import { toDay, type WeekStartsOn } from '../../../core/dates';
import type { Habit } from '../../../core/types';
import type { HabitsView } from '../../../shared/ipc';
import { useHabits } from '../hooks/useHabits';
import { useLogs } from '../hooks/useLogs';
import { useNow } from '../hooks/useNow';
import { errorMessage } from '../lib/format';
import { buildTodayModel, todaySummary } from '../lib/todayModel';
import { EmptyState } from './EmptyState';
import { HabitDialog } from './HabitDialog';
import { MonthView } from './MonthView';
import { panelId, tabId, Tabs } from './Tabs';
import { TodayView } from './TodayView';
import { YearView } from './YearView';

interface HabitsPageProps {
  weekStartsOn: WeekStartsOn;
  view: HabitsView;
  onViewChange(view: HabitsView): void;
}

/** null: closed. 'new': adding a habit. A Habit: editing that habit. */
type DialogState = null | 'new' | Habit;

/** Streaks on Today need every completion ever made. */
const EARLIEST_DAY = '1970-01-01';

/**
 * Which logs each view needs. Month and Year load 6 extra days on each side so a weekly habit
 * can see the whole of a week that crosses the edge.
 */
function logRange(view: HabitsView, today: string, year: number, month: number) {
  if (view === 'today') return { from: EARLIEST_DAY, to: today };
  const first = view === 'month' ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const last = view === 'month' ? endOfMonth(first) : new Date(year, 11, 31);
  return { from: toDay(addDays(first, -6)), to: toDay(addDays(last, 6)) };
}

export function HabitsPage({ weekStartsOn, view, onViewChange }: HabitsPageProps) {
  const now = useNow();
  const today = toDay(now);
  const data = useHabits();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);

  // Each view remembers where you were, so switching tabs doesn't reset the month or year.
  const [shownMonth, setShownMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [shownYear, setShownYear] = useState(now.getFullYear());
  const isThisMonth = shownMonth.year === now.getFullYear() && shownMonth.month === now.getMonth() + 1;

  const range = logRange(view, today, view === 'year' ? shownYear : shownMonth.year, shownMonth.month);
  const logs = useLogs(range.from, range.to, data.version);
  // The header's "X of Y done today" needs only this week, whichever view is open.
  const recentLogs = useLogs(toDay(addDays(now, -6)), today, data.version);

  const summary = useMemo(
    () => data.habits && recentLogs && todaySummary(data.habits, recentLogs, today, weekStartsOn),
    [data.habits, recentLogs, today, weekStartsOn]
  );
  const todayModel = useMemo(
    () => view === 'today' && data.habits && logs && buildTodayModel(data.habits, logs, today, weekStartsOn),
    [view, data.habits, logs, today, weekStartsOn]
  );
  const activeHabits = useMemo(() => data.habits?.filter((habit) => !habit.archivedAt) ?? [], [data.habits]);

  /** Runs an action and shows its error in the banner instead of failing silently. */
  async function attempt(action: () => Promise<void>) {
    try {
      setError(null);
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const toggle = (habitId: string, day: string) => attempt(() => data.toggle(habitId, day));

  function moveMonth(delta: number) {
    setShownMonth(({ year, month }) => {
      const index = year * 12 + (month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  }

  const isEmpty = data.habits?.length === 0;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-header__date">{format(now, 'EEEE d MMMM')}</p>
          <h1 className="page-header__title">Habits</h1>
          {summary && !isEmpty && (
            <p className="page-header__summary" aria-live="polite">
              {summary.done} of {summary.due} done today
            </p>
          )}
        </div>
        {!isEmpty && (
          <button type="button" className="button button--primary" onClick={() => setDialog('new')}>
            New habit
          </button>
        )}
      </header>

      {!isEmpty && <Tabs value={view} onChange={onViewChange} />}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="button button--quiet" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div id={panelId} role="tabpanel" aria-labelledby={isEmpty ? undefined : tabId(view)}>
        {isEmpty && <EmptyState onNew={() => setDialog('new')} />}

        {!isEmpty && view === 'today' && todayModel && (
          <TodayView
            model={todayModel}
            now={now}
            weekStartsOn={weekStartsOn}
            onToggle={toggle}
            onEdit={setDialog}
            onRestore={(id) => attempt(() => data.restore(id))}
          />
        )}

        {!isEmpty && view === 'month' && (
          <MonthView
            habits={activeHabits}
            logs={logs}
            year={shownMonth.year}
            month={shownMonth.month}
            today={today}
            weekStartsOn={weekStartsOn}
            onMove={moveMonth}
            onReset={
              isThisMonth
                ? undefined
                : () => setShownMonth({ year: now.getFullYear(), month: now.getMonth() + 1 })
            }
            onToggle={toggle}
            onEdit={setDialog}
          />
        )}

        {!isEmpty && view === 'year' && data.habits && (
          <YearView
            habits={data.habits}
            logs={logs}
            year={shownYear}
            today={today}
            weekStartsOn={weekStartsOn}
            onMove={(delta) => setShownYear((year) => year + delta)}
            onReset={shownYear === now.getFullYear() ? undefined : () => setShownYear(now.getFullYear())}
          />
        )}
      </div>

      {dialog && (
        <HabitDialog
          habit={dialog === 'new' ? undefined : dialog}
          weekStartsOn={weekStartsOn}
          onClose={() => setDialog(null)}
          onSave={(input) => (dialog === 'new' ? data.create(input) : data.update(dialog.id, input))}
          onArchive={(id) => data.archive(id)}
          onDelete={(id) => data.remove(id)}
        />
      )}
    </>
  );
}
