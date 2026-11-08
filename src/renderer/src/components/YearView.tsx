import { useMemo } from 'react';
import type { WeekStartsOn } from '../../../core/dates';
import { groupLogsByHabit } from '../../../core/history';
import type { Habit, HabitLog } from '../../../core/types';
import { overallYearHeatmap, yearHeatmap, yearLayout, type HeatmapDay } from '../../../core/year';
import { describeSchedule } from '../lib/format';
import { Heatmap, HeatScale } from './Heatmap';
import { PeriodToolbar } from './PeriodToolbar';
import './YearView.css';

interface YearViewProps {
  /** All habits, archived included: their history still counts in "All habits". */
  habits: Habit[];
  /** null while this year's logs are loading */
  logs: HabitLog[] | null;
  year: number;
  today: string;
  weekStartsOn: WeekStartsOn;
  onMove(delta: number): void;
  onReset?: () => void;
}

function describeHabitDay(today: string) {
  return (day: HeatmapDay) => {
    if (day.kind === 'future') return 'upcoming';
    if (day.kind === 'unscheduled') return 'not scheduled';
    if (day.level === 4) return 'done';
    return day.day === today ? 'not done yet' : 'missed';
  };
}

function describeOverallDay(day: HeatmapDay) {
  if (day.kind === 'future') return 'upcoming';
  if (day.kind === 'unscheduled') return 'nothing scheduled';
  return `${day.done} of ${day.scheduled} done`;
}

const percentText = (percent: number | null) => (percent === null ? '–' : `${percent}%`);

export function YearView({ habits, logs, year, today, weekStartsOn, onMove, onReset }: YearViewProps) {
  const layout = useMemo(() => yearLayout(year, weekStartsOn), [year, weekStartsOn]);

  const data = useMemo(() => {
    if (!logs) return null;
    const byHabit = groupLogsByHabit(logs);
    return {
      overall: overallYearHeatmap(habits, byHabit, year, today),
      perHabit: habits
        .filter((habit) => !habit.archivedAt)
        .map((habit) => ({
          habit,
          year: yearHeatmap(habit, byHabit.get(habit.id) ?? [], year, today, weekStartsOn),
        })),
    };
  }, [habits, logs, year, today, weekStartsOn]);

  const describeHabit = describeHabitDay(today);

  return (
    <div className="fade-in">
      <PeriodToolbar
        label={String(year)}
        unit="year"
        onPrevious={() => onMove(-1)}
        onNext={() => onMove(1)}
        resetLabel="This year"
        onReset={onReset}
      >
        <HeatScale />
      </PeriodToolbar>

      {data && (
        // key={year} gives each year a fresh component, so keyboard focus starts in the right place.
        <div className="year-cards" key={year}>
          <section className="card year-card" aria-labelledby="year-all">
            <header className="year-card__header">
              <h3 id="year-all" className="year-card__title">All habits</h3>
              <p className="year-card__stats">
                <span><strong>{percentText(data.overall.percent)}</strong> of scheduled days done</span>
                <span><strong>{data.overall.checkIns}</strong> check-ins</span>
              </p>
            </header>
            <Heatmap
              label={`All habits, ${year}`}
              layout={layout}
              days={data.overall.days}
              today={today}
              weekStartsOn={weekStartsOn}
              color="var(--accent)"
              describe={describeOverallDay}
            />
            <p className="year-card__note">Weekly habits aren’t included here.</p>
          </section>

          {data.perHabit.map(({ habit, year: stats }) => (
            <section key={habit.id} className="card year-card" aria-labelledby={`year-${habit.id}`}>
              <header className="year-card__header">
                <div>
                  <h3 id={`year-${habit.id}`} className="year-card__title">
                    <span className="year-card__dot" style={{ background: habit.color }} aria-hidden="true" />
                    {habit.name}
                  </h3>
                  <p className="year-card__schedule">{describeSchedule(habit, weekStartsOn)}</p>
                </div>
                <p className="year-card__stats">
                  <span><strong>{percentText(stats.percent)}</strong> done</span>
                  <span><strong>{stats.daysDone}</strong> {stats.daysDone === 1 ? 'day' : 'days'} done</span>
                  <span><strong>{stats.bestStreak}</strong> best streak</span>
                </p>
              </header>
              <Heatmap
                label={`${habit.name}, ${year}`}
                layout={layout}
                days={stats.days}
                today={today}
                weekStartsOn={weekStartsOn}
                color={habit.color}
                describe={describeHabit}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
