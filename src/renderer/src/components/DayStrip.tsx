import { eachDayOfInterval, format, subDays } from 'date-fns';
import { parseDay, toDay, type WeekStartsOn } from '../../../core/dates';
import { dayStatus, type DayStatus } from '../../../core/history';
import type { Habit } from '../../../core/types';
import './DayStrip.css';

interface DayStripProps {
  habit: Habit;
  completed: ReadonlySet<string>;
  today: string;
  weekStartsOn: WeekStartsOn;
  onToggle(day: string): void;
}

const STATUS_LABEL: Record<DayStatus, string> = {
  done: 'done',
  missed: 'missed',
  pending: 'not done yet',
  unscheduled: 'not scheduled',
  future: 'upcoming',
};

/** The last 7 days, oldest first. Each day is a button, so any of them can be backfilled. */
export function DayStrip({ habit, completed, today, weekStartsOn, onToggle }: DayStripProps) {
  const end = parseDay(today);
  const days = eachDayOfInterval({ start: subDays(end, 6), end }).map(toDay);

  return (
    <div className="day-strip" role="group" aria-label={`${habit.name}, last 7 days`}>
      {days.map((day) => {
        const date = parseDay(day);
        const status = dayStatus(habit, day, completed, today, weekStartsOn);
        const isDone = status === 'done';
        return (
          <button
            key={day}
            type="button"
            className={`day-strip__day day-strip__day--${status}${day === today ? ' is-today' : ''}`}
            aria-pressed={isDone}
            aria-label={`${format(date, 'EEEE d MMMM')}: ${STATUS_LABEL[status]}`}
            title={`${format(date, 'EEE d MMM')}: ${STATUS_LABEL[status]}`}
            onClick={() => onToggle(day)}
          >
            <span className="day-strip__label" aria-hidden="true">
              {format(date, 'EEEEE')}
            </span>
            <span className="day-strip__mark" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
