import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { toDay, type WeekStartsOn } from '../../../core/dates';
import type { Habit } from '../../../core/types';
import { useHabitData } from '../hooks/useHabitData';
import { useNow } from '../hooks/useNow';
import { errorMessage } from '../lib/format';
import { buildTodayModel } from '../lib/todayModel';
import { HabitDialog } from './HabitDialog';
import { Tabs } from './Tabs';
import { TodayView } from './TodayView';

interface HabitsPageProps {
  weekStartsOn: WeekStartsOn;
}

/** null: closed. 'new': adding a habit. A Habit: editing that habit. */
type DialogState = null | 'new' | Habit;

export function HabitsPage({ weekStartsOn }: HabitsPageProps) {
  const now = useNow();
  const today = toDay(now);
  const data = useHabitData(today);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [error, setError] = useState<string | null>(null);

  // useMemo re-runs this only when its inputs change, not on every render (like the 30 s tick).
  const model = useMemo(
    () => data.habits && buildTodayModel(data.habits, data.logs, today, weekStartsOn),
    [data.habits, data.logs, today, weekStartsOn]
  );

  async function toggle(habitId: string, day: string) {
    try {
      setError(null);
      await data.toggle(habitId, day);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function restore(id: string) {
    try {
      setError(null);
      await data.restore(id);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  const isEmpty = data.habits?.length === 0;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-header__date">{format(now, 'EEEE d MMMM')}</p>
          <h1 className="page-header__title">Habits</h1>
          {model && !isEmpty && (
            <p className="page-header__summary" aria-live="polite">
              {model.doneCount} of {model.due.length} done today
            </p>
          )}
        </div>
        {!isEmpty && (
          <button type="button" className="button button--primary" onClick={() => setDialog('new')}>
            New habit
          </button>
        )}
      </header>

      {!isEmpty && <Tabs />}

      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="button button--quiet" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {model && (
        <TodayView
          model={model}
          now={now}
          weekStartsOn={weekStartsOn}
          isEmpty={isEmpty}
          onToggle={toggle}
          onEdit={setDialog}
          onRestore={restore}
          onNew={() => setDialog('new')}
        />
      )}

      {dialog && (
        <HabitDialog
          habit={dialog === 'new' ? undefined : dialog}
          weekStartsOn={weekStartsOn}
          onClose={() => setDialog(null)}
          onSave={(input) =>
            dialog === 'new' ? data.create(input) : data.update(dialog.id, input)
          }
          onArchive={(id) => data.archive(id)}
          onDelete={(id) => data.remove(id)}
        />
      )}
    </>
  );
}
