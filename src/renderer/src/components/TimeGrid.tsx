import { format, parseISO } from 'date-fns';
import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react';
import { layoutDay } from '../../../core/calendar';
import { parseDay } from '../../../core/dates';
import type { EventOccurrenceDto } from '../../../shared/ipc';
import { clockTime, occurrenceKey as keyOf, occurrenceLabel as itemLabel, SyncFailedMark, TaskCheck } from './CalendarItem';
import './TimeGrid.css';

/** Height of one hour in pixels. Half-hour clicks snap to HOUR_PX / 2. */
const HOUR_PX = 44;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface TimeGridProps {
  /** The days to show as columns, oldest first (7 for Week, 1 for Day). */
  days: string[];
  today: string;
  now: Date;
  occurrences: EventOccurrenceDto[];
  /** A day's header was clicked (Week shows that day in Day view). Omit to make headers plain. */
  onPickDay?: (day: string) => void;
  onCreateAt(start: Date): void;
  onCreateAllDay(day: string): void;
  onOpen(occurrence: EventOccurrenceDto): void;
  onToggleTask(occurrence: EventOccurrenceDto): void;
}

/**
 * Days as columns and hours as rows, with an all-day row on top. Overlapping items share the
 * column's width (see layoutDay in core). Clicking an empty spot starts a new event there.
 */
export function TimeGrid({
  days,
  today,
  now,
  occurrences,
  onPickDay,
  onCreateAt,
  onCreateAllDay,
  onOpen,
  onToggleTask,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showsToday = days.includes(today);

  // Scroll to an hour before now when today is shown, otherwise to 7 am. Runs when the range
  // changes, not every minute, so it never fights the user's own scrolling.
  useEffect(() => {
    const hour = showsToday ? Math.max(0, now.getHours() - 1) : 7;
    if (scrollRef.current) scrollRef.current.scrollTop = hour * HOUR_PX;
  }, [days[0], days.length]); // `now` and `showsToday` left out on purpose

  const { allDay, timed } = useMemo(() => {
    const allDayItems = occurrences.filter((o) => o.event.allDay);
    const timedItems = occurrences.filter((o) => !o.event.allDay);
    const byKey = new Map(timedItems.map((o) => [keyOf(o), o]));
    return {
      // An all-day item shows in every day it covers (its end day is exclusive).
      allDay: days.map((day) => allDayItems.filter((o) => o.startAt <= day && day < o.endAt)),
      timed: days.map((day) =>
        layoutDay(
          timedItems.map((o) => ({ id: keyOf(o), start: parseISO(o.startAt), end: parseISO(o.endAt) })),
          day,
        ).map((placed) => ({ placed, occurrence: byKey.get(placed.id)! })),
      ),
    };
  }, [occurrences, days]);

  const columns = { gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` };
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  function createFromClick(day: string, event: MouseEvent<HTMLDivElement>) {
    // Only clicks on the empty column itself, not on an item inside it.
    if (event.target !== event.currentTarget) return;
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const halfHours = Math.min(47, Math.max(0, Math.floor(y / (HOUR_PX / 2))));
    const start = parseDay(day);
    start.setMinutes(halfHours * 30);
    onCreateAt(start);
  }

  return (
    <div className="time-grid card">
      <div className="time-grid__head" style={columns}>
        <div />
        {days.map((day) => {
          const date = parseDay(day);
          const content = (
            <>
              <span className="time-grid__weekday">{format(date, 'EEE')}</span>
              <span className="time-grid__date">{format(date, 'd')}</span>
            </>
          );
          const className = `time-grid__day-head${day === today ? ' is-today' : ''}`;
          return onPickDay ? (
            <button
              key={day}
              type="button"
              className={className}
              aria-label={`${format(date, 'EEEE d MMMM')}, show this day`}
              aria-current={day === today ? 'date' : undefined}
              onClick={() => onPickDay(day)}
            >
              {content}
            </button>
          ) : (
            <div key={day} className={className} aria-current={day === today ? 'date' : undefined}>
              {content}
            </div>
          );
        })}
      </div>

      <div className="time-grid__all-day" style={columns}>
        <div className="time-grid__gutter-label">All day</div>
        {days.map((day, index) => (
          <div
            key={day}
            className="time-grid__all-day-cell"
            title="Click to add an all-day event"
            onClick={(event) => {
              if (event.target === event.currentTarget) onCreateAllDay(day);
            }}
          >
            {allDay[index].map((o) => (
              <div
                key={keyOf(o)}
                className={`cal-chip${o.event.kind === 'task' ? ' cal-chip--task' : ''}${o.done ? ' is-done' : ''}`}
              >
                {o.event.kind === 'task' && <TaskCheck occurrence={o} onToggle={() => onToggleTask(o)} />}
                <SyncFailedMark occurrence={o} />
                <button type="button" className="cal-open" aria-label={itemLabel(o)} onClick={() => onOpen(o)}>
                  {o.event.title}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="time-grid__scroll" ref={scrollRef}>
        <div className="time-grid__body" style={{ ...columns, height: 24 * HOUR_PX }}>
          <div className="time-grid__hours" aria-hidden="true">
            {HOURS.map((hour) => (
              <span key={hour} style={{ top: hour * HOUR_PX }}>
                {hour === 0 ? '' : format(new Date(2000, 0, 1, hour), 'h a').toLowerCase()}
              </span>
            ))}
          </div>

          {days.map((day, index) => (
            <div
              key={day}
              className={`time-grid__column${day === today ? ' is-today' : ''}`}
              style={{ '--hour': `${HOUR_PX}px` } as CSSProperties}
              onClick={(event) => createFromClick(day, event)}
            >
              {timed[index].map(({ placed, occurrence: o }) => {
                const height = ((placed.bottom - placed.top) / 60) * HOUR_PX;
                return (
                  <div
                    key={placed.id}
                    className={`cal-item${o.event.kind === 'task' ? ' cal-item--task' : ''}${o.done ? ' is-done' : ''}${height < 40 ? ' is-short' : ''}`}
                    style={{
                      top: (placed.top / 60) * HOUR_PX,
                      height: height - 2,
                      left: `calc(${(placed.column / placed.columns) * 100}% + 2px)`,
                      width: `calc(${100 / placed.columns}% - 4px)`,
                    }}
                  >
                    {o.event.kind === 'task' && <TaskCheck occurrence={o} onToggle={() => onToggleTask(o)} />}
                    <SyncFailedMark occurrence={o} />
                    <button type="button" className="cal-open" aria-label={itemLabel(o)} onClick={() => onOpen(o)}>
                      <span className="cal-item__title">{o.event.title}</span>
                      <span className="cal-item__time">{clockTime(o.startAt)}</span>
                    </button>
                  </div>
                );
              })}

              {day === today && (
                <div className="time-grid__now" style={{ top: (nowMinutes / 60) * HOUR_PX }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
