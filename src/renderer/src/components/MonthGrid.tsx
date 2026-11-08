import { format, getDay } from 'date-fns';
import type { CSSProperties } from 'react';
import { parseDay } from '../../../core/dates';
import type { DayStatus } from '../../../core/history';
import type { MonthGrid as Grid, MonthRate } from '../../../core/month';
import type { Habit } from '../../../core/types';
import { useRovingGrid } from '../hooks/useRovingGrid';

interface MonthGridProps {
  rows: { habit: Habit; grid: Grid }[];
  today: string;
  onToggle(habitId: string, day: string): void;
  onEdit(habit: Habit): void;
}

const STATUS_TEXT: Record<DayStatus, string> = {
  done: 'done',
  missed: 'missed',
  pending: 'not done yet',
  unscheduled: 'not scheduled',
  future: 'upcoming',
};

function rateText(rate: MonthRate): { short: string; long: string } {
  if (rate.kind === 'weeks') {
    return { short: `${rate.weeks} wk`, long: `${rate.weeks} ${rate.weeks === 1 ? 'week' : 'weeks'} done this month` };
  }
  if (rate.percent === null) return { short: '–', long: 'Nothing scheduled yet' };
  return { short: `${rate.percent}%`, long: `${rate.done} of ${rate.scheduled} scheduled days done` };
}

/**
 * Habits as rows, days as columns. It's a real <table>, so screen readers can announce the
 * habit and date for each cell. Arrow keys move between cells (see useRovingGrid).
 */
export function MonthGrid({ rows, today, onToggle, onEdit }: MonthGridProps) {
  const days = rows[0].grid.days.map((entry) => entry.day);
  const todayCol = days.indexOf(today);
  const nav = useRovingGrid(rows.length, days.length, [0, Math.max(0, todayCol)]);

  return (
    <div className="card month-scroll" ref={nav.containerRef} onKeyDown={nav.onKeyDown}>
      <table className="month-grid">
        <thead>
          <tr>
            <th scope="col" className="month-grid__name">
              <span className="visually-hidden">Habit</span>
            </th>
            {days.map((day) => {
              const date = parseDay(day);
              const weekend = getDay(date) === 0 || getDay(date) === 6;
              return (
                <th
                  key={day}
                  scope="col"
                  className={`month-grid__day${weekend ? ' is-weekend' : ''}${day === today ? ' is-today' : ''}`}
                  aria-label={format(date, 'EEEE d MMMM')}
                >
                  <span className="month-grid__weekday">{format(date, 'EEEEE')}</span>
                  <span className="month-grid__date">{format(date, 'd')}</span>
                </th>
              );
            })}
            <th scope="col" className="month-grid__rate">
              Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ habit, grid }, row) => {
            const rate = rateText(grid.rate);
            return (
              <tr key={habit.id} style={{ '--habit': habit.color } as CSSProperties}>
                <th scope="row" className="month-grid__name">
                  <button
                    type="button"
                    className="month-grid__habit"
                    title={`Edit ${habit.name}`}
                    onClick={() => onEdit(habit)}
                  >
                    <span className="month-grid__habit-name">{habit.name}</span>
                  </button>
                </th>
                {grid.days.map(({ day, status }, col) => {
                  // Future and unscheduled cells can't be toggled. They stay focusable (with
                  // aria-disabled) so the arrow keys can move across them.
                  const inactive = status === 'future' || status === 'unscheduled';
                  return (
                    <td key={day}>
                      <button
                        type="button"
                        className={`month-cell month-cell--${status}${day === today ? ' is-today' : ''}`}
                        data-row={row}
                        data-col={col}
                        tabIndex={nav.tabIndexFor(row, col)}
                        aria-disabled={inactive || undefined}
                        aria-pressed={inactive ? undefined : status === 'done'}
                        aria-label={`${habit.name}, ${format(parseDay(day), 'EEEE d MMMM')}: ${STATUS_TEXT[status]}`}
                        title={`${format(parseDay(day), 'EEE d MMM')}: ${STATUS_TEXT[status]}`}
                        onFocus={() => nav.setActive(row, col)}
                        onClick={() => {
                          if (!inactive) onToggle(habit.id, day);
                        }}
                      />
                    </td>
                  );
                })}
                <td className="month-grid__rate" title={rate.long}>
                  <span aria-hidden="true">{rate.short}</span>
                  <span className="visually-hidden">{rate.long}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
