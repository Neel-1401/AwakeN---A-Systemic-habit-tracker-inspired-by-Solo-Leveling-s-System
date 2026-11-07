import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import type { WeekStartsOn } from '../../../core/dates';
import { remindersForDay } from '../../../core/reminders';
import type { Habit } from '../../../core/types';
import type { TodayModel } from '../lib/todayModel';
import { EmptyState } from './EmptyState';
import { HabitRow } from './HabitRow';
import { RemindersCard } from './RemindersCard';
import './TodayView.css';

interface TodayViewProps {
  model: TodayModel;
  now: Date;
  weekStartsOn: WeekStartsOn;
  isEmpty: boolean;
  onToggle(habitId: string, day: string): void;
  onEdit(habit: Habit): void;
  onRestore(id: string): void;
  onNew(): void;
}

export function TodayView({
  model,
  now,
  weekStartsOn,
  isEmpty,
  onToggle,
  onEdit,
  onRestore,
  onNew,
}: TodayViewProps) {
  const reminders = useMemo(() => {
    const active = [...model.due, ...model.notScheduled];
    const logsById = new Map(active.map((view) => [view.habit.id, view.logs]));
    return remindersForDay(
      active.map((view) => view.habit),
      (id) => logsById.get(id) ?? [],
      now,
      weekStartsOn
    );
  }, [model, now, weekStartsOn]);

  if (isEmpty) return <EmptyState onNew={onNew} />;

  const names = new Map([...model.due, ...model.notScheduled].map((v) => [v.habit.id, v.habit]));

  return (
    <div className="today fade-in">
      {reminders.length > 0 && <RemindersCard reminders={reminders} habits={names} />}

      <section aria-labelledby="due-title">
        <h2 id="due-title" className="section-title">
          Due today
        </h2>
        {model.due.length > 0 ? (
          <ul className="today__list card">
            {model.due.map((view) => (
              <HabitRow
                key={view.habit.id}
                view={view}
                now={now}
                weekStartsOn={weekStartsOn}
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))}
          </ul>
        ) : (
          <p className="today__none card">
            {model.notScheduled.length > 0
              ? 'Nothing is due today.'
              : 'No active habits. Restore one below, or add a new one.'}
          </p>
        )}
      </section>

      {model.notScheduled.length > 0 && (
        <section aria-labelledby="rest-title">
          <h2 id="rest-title" className="section-title">
            Not scheduled today
          </h2>
          <ul className="today__list card">
            {model.notScheduled.map((view) => (
              <HabitRow
                key={view.habit.id}
                view={view}
                now={now}
                weekStartsOn={weekStartsOn}
                muted
                onToggle={onToggle}
                onEdit={onEdit}
              />
            ))}
          </ul>
        </section>
      )}

      {model.archived.length > 0 && (
        // <details> is a built-in disclosure: it opens with Enter/Space and needs no JS state.
        <details className="today__archived">
          <summary className="section-title">Archived ({model.archived.length})</summary>
          <ul className="today__list card">
            {model.archived.map((habit) => (
              <li key={habit.id} className="archived-row">
                <span>{habit.name}</span>
                <span className="muted">
                  Archived {format(parseISO(habit.archivedAt!), 'd MMM yyyy')}
                </span>
                <button type="button" className="button" onClick={() => onRestore(habit.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
