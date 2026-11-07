import type { CSSProperties } from 'react';
import { toDay, type WeekStartsOn } from '../../../core/dates';
import type { Habit } from '../../../core/types';
import { describeSchedule, formatTime } from '../lib/format';
import type { HabitView } from '../lib/todayModel';
import { CheckButton } from './CheckButton';
import { DayStrip } from './DayStrip';
import './HabitRow.css';

interface HabitRowProps {
  view: HabitView;
  now: Date;
  weekStartsOn: WeekStartsOn;
  /** For "Not scheduled today": dimmed, and no big check button (the strip still works). */
  muted?: boolean;
  onToggle(habitId: string, day: string): void;
  onEdit(habit: Habit): void;
}

export function HabitRow({ view, now, weekStartsOn, muted, onToggle, onEdit }: HabitRowProps) {
  const { habit, completed, streaks, doneToday } = view;
  const today = toDay(now);
  let schedule = describeSchedule(habit, weekStartsOn);
  if (muted && habit.frequency === 'weekly') schedule += ' · done this week';
  if (habit.reminderTime) schedule += ` · ${formatTime(habit.reminderTime)}`;

  // A CSS custom property set inline: everything inside the row can use var(--habit).
  const style = { '--habit': habit.color } as CSSProperties;

  return (
    <li className={`habit-row${muted ? ' habit-row--muted' : ''}`} style={style}>
      <div className="habit-row__check">
        {!muted && (
          <CheckButton
            done={doneToday}
            label={habit.name}
            onClick={() => onToggle(habit.id, today)}
          />
        )}
      </div>

      <div className="habit-row__text">
        <span className="habit-row__name">{habit.name}</span>
        <span className="habit-row__schedule">{schedule}</span>
      </div>

      <DayStrip
        habit={habit}
        completed={completed}
        today={today}
        weekStartsOn={weekStartsOn}
        onToggle={(day) => onToggle(habit.id, day)}
      />

      <dl className="habit-row__streaks">
        <div>
          <dt>Current</dt>
          <dd>{streaks.current}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{streaks.best}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="button button--quiet"
        aria-label={`Edit ${habit.name}`}
        onClick={() => onEdit(habit)}
      >
        Edit
      </button>
    </li>
  );
}
