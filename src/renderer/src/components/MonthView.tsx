import { format } from 'date-fns';
import { useMemo } from 'react';
import type { WeekStartsOn } from '../../../core/dates';
import { groupLogsByHabit } from '../../../core/history';
import { monthGrid } from '../../../core/month';
import type { Habit, HabitLog } from '../../../core/types';
import { MonthGrid } from './MonthGrid';
import { PeriodToolbar } from './PeriodToolbar';
import './MonthView.css';

interface MonthViewProps {
  habits: Habit[];
  /** null while this month's logs are loading */
  logs: HabitLog[] | null;
  year: number;
  month: number;
  today: string;
  weekStartsOn: WeekStartsOn;
  onMove(delta: number): void;
  onReset?: () => void;
  onToggle(habitId: string, day: string): void;
  onEdit(habit: Habit): void;
}

export function MonthView({ habits, logs, year, month, today, weekStartsOn, onMove, onReset, onToggle, onEdit }: MonthViewProps) {
  const rows = useMemo(() => {
    if (!logs) return null;
    const byHabit = groupLogsByHabit(logs);
    return habits.map((habit) => ({
      habit,
      grid: monthGrid(habit, byHabit.get(habit.id) ?? [], year, month, today, weekStartsOn),
    }));
  }, [habits, logs, year, month, today, weekStartsOn]);

  return (
    <div className="fade-in">
      <PeriodToolbar
        label={format(new Date(year, month - 1, 1), 'MMMM yyyy')}
        unit="month"
        onPrevious={() => onMove(-1)}
        onNext={() => onMove(1)}
        resetLabel="This month"
        onReset={onReset}
      >
        <ul className="legend" aria-label="Legend">
          <li><span className="month-cell month-cell--done legend__swatch" /> Done</li>
          <li><span className="month-cell month-cell--missed legend__swatch" /> Missed</li>
          <li><span className="month-cell month-cell--unscheduled legend__swatch" /> Not scheduled</li>
        </ul>
      </PeriodToolbar>

      {habits.length === 0 ? (
        <p className="card month-empty">No active habits to show.</p>
      ) : (
        rows && (
          // A fresh grid per month, so keyboard focus starts on today's column (or the 1st).
          <MonthGrid key={`${year}-${month}`} rows={rows} today={today} onToggle={onToggle} onEdit={onEdit} />
        )
      )}
    </div>
  );
}
