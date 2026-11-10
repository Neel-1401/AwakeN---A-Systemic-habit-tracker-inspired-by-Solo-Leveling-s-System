import { format, getMonth } from 'date-fns';
import { useMemo, type MouseEvent } from 'react';
import { groupByDay } from '../../../core/calendar';
import { parseDay } from '../../../core/dates';
import type { EventOccurrenceDto } from '../../../shared/ipc';
import { useRovingGrid } from '../hooks/useRovingGrid';
import { clockTime, occurrenceKey, occurrenceLabel, TaskCheck } from './CalendarItem';
import './CalendarMonth.css';

/** Items shown in a day before the rest fold into "+N more". */
const MAX_SHOWN = 3;

interface CalendarMonthProps {
  /** Rows of 7 day keys, from core monthWeeks. */
  weeks: string[][];
  /** 1–12: days outside it are drawn faded. */
  month: number;
  today: string;
  occurrences: EventOccurrenceDto[];
  onPickDay(day: string): void;
  onCreateOn(day: string): void;
  onOpen(occurrence: EventOccurrenceDto): void;
  onToggleTask(occurrence: EventOccurrenceDto): void;
}

/** Keyboard focus starts on today if it's in view, otherwise on the 1st. */
function startCell(weeks: string[][], today: string, month: number): [number, number] {
  for (const target of [today, null]) {
    for (let row = 0; row < weeks.length; row++) {
      const col = weeks[row].findIndex((day) =>
        target ? day === target : getMonth(parseDay(day)) + 1 === month && day.endsWith('-01'),
      );
      if (col >= 0) return [row, col];
    }
  }
  return [0, 0];
}

/**
 * The month as a grid of days. Each day lists its first few items. The day numbers form one
 * keyboard grid (arrow keys move, Enter opens that day); items are reached through Day view, so
 * Tab doesn't have to stop on every one of them.
 */
export function CalendarMonth({
  weeks,
  month,
  today,
  occurrences,
  onPickDay,
  onCreateOn,
  onOpen,
  onToggleTask,
}: CalendarMonthProps) {
  const days = weeks.flat();
  const byDay = useMemo(
    () => groupByDay(occurrences, days, (o) => ({ allDay: o.event.allDay, startAt: o.startAt, endAt: o.endAt })),
    // `days` is a new array every render; its first day and length identify it.
    [occurrences, days[0], days.length],
  );
  const nav = useRovingGrid(weeks.length, 7, startCell(weeks, today, month));

  function createFromClick(day: string, event: MouseEvent<HTMLElement>) {
    // Only clicks on the empty part of the day, not on an item or the date.
    if (event.target === event.currentTarget) onCreateOn(day);
  }

  return (
    <div className="cal-month card" ref={nav.containerRef} onKeyDown={nav.onKeyDown}>
      <div className="cal-month__weekdays" aria-hidden="true">
        {weeks[0].map((day) => (
          <span key={day}>{format(parseDay(day), 'EEE')}</span>
        ))}
      </div>
      {weeks.map((week, row) => (
        <div key={week[0]} className="cal-month__week">
          {week.map((day, col) => {
            const date = parseDay(day);
            const items = byDay.get(day) ?? [];
            const hidden = items.length - MAX_SHOWN;
            const outside = getMonth(date) + 1 !== month;
            return (
              <div
                key={day}
                className={`cal-month__day${outside ? ' is-outside' : ''}${day === today ? ' is-today' : ''}`}
                title="Click an empty spot to add an event"
                onClick={(event) => createFromClick(day, event)}
              >
                <button
                  type="button"
                  className="cal-month__date"
                  data-row={row}
                  data-col={col}
                  tabIndex={nav.tabIndexFor(row, col)}
                  aria-current={day === today ? 'date' : undefined}
                  aria-label={`${format(date, 'EEEE d MMMM')}, ${items.length === 0 ? 'nothing on' : `${items.length} ${items.length === 1 ? 'item' : 'items'}`}. Open this day`}
                  onFocus={() => nav.setActive(row, col)}
                  onClick={() => onPickDay(day)}
                >
                  {format(date, 'd')}
                </button>
                {items.slice(0, MAX_SHOWN).map((o) => (
                  <div
                    key={occurrenceKey(o)}
                    className={`cal-month__item${o.event.allDay ? ' is-all-day' : ''}${o.done ? ' is-done' : ''}`}
                  >
                    {o.event.kind === 'task' && (
                      <TaskCheck occurrence={o} tabIndex={-1} onToggle={() => onToggleTask(o)} />
                    )}
                    <button
                      type="button"
                      className="cal-month__open"
                      tabIndex={-1}
                      aria-label={occurrenceLabel(o)}
                      onClick={() => onOpen(o)}
                    >
                      {!o.event.allDay && <span className="cal-month__time">{clockTime(o.startAt)}</span>}
                      <span className="cal-month__title">{o.event.title}</span>
                    </button>
                  </div>
                ))}
                {hidden > 0 && (
                  <button type="button" className="cal-month__more" tabIndex={-1} onClick={() => onPickDay(day)}>
                    +{hidden} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
