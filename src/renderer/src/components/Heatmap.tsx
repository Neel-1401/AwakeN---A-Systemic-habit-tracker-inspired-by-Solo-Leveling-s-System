import { format } from 'date-fns';
import { useState, type CSSProperties } from 'react';
import { parseDay, type WeekStartsOn } from '../../../core/dates';
import type { HeatmapDay, YearLayout } from '../../../core/year';
import { useRovingGrid } from '../hooks/useRovingGrid';
import './Heatmap.css';

interface HeatmapProps {
  /** Accessible name, e.g. "All habits, 2026" */
  label: string;
  layout: YearLayout;
  days: HeatmapDay[];
  today: string;
  weekStartsOn: WeekStartsOn;
  /** The colour level 4 is drawn in. */
  color: string;
  /** Text for a square, e.g. "done" or "2 of 3 done". */
  describe(day: HeatmapDay): string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHOWN_WEEKDAYS: Record<number, string> = { 1: 'M', 3: 'W', 5: 'F' };

/** Keyboard focus starts on today, or on 1 January when today isn't in this year. */
function startCell(columns: YearLayout['columns'], today: string): [number, number] {
  for (let col = 0; col < columns.length; col++) {
    const row = columns[col].indexOf(today);
    if (row >= 0) return [row, col];
  }
  return [columns[0].findIndex(Boolean), 0];
}

function cellClass(day: HeatmapDay, today: string): string {
  const kind = day.kind === 'level' ? `heat--l${day.level}` : day.kind === 'unscheduled' ? 'heat--off' : 'heat--future';
  return `heat ${kind}${day.day === today ? ' is-today' : ''}`;
}

/**
 * A year as week columns × weekday rows. Squares are focusable with a roving tabindex, so Tab
 * reaches the heatmap once and the arrow keys walk the days. The line under the grid repeats
 * the focused or hovered day, since tooltips don't appear for keyboard focus.
 */
export function Heatmap({ label, layout, days, today, weekStartsOn, color, describe }: HeatmapProps) {
  const byDay = new Map(days.map((day) => [day.day, day]));
  const { columns, monthStarts } = layout;
  const nav = useRovingGrid(7, columns.length, startCell(columns, today), (r, c) => columns[c]?.[r] != null);
  const [shown, setShown] = useState<string | null>(null);

  const text = (day: HeatmapDay) => `${format(parseDay(day.day), 'd MMM')}: ${describe(day)}`;
  const shownDay = shown ? byDay.get(shown) : undefined;

  return (
    <div className="heatmap" style={{ '--heat': color, '--weeks': columns.length } as CSSProperties}>
      <div className="heatmap__months" aria-hidden="true">
        {monthStarts.map(({ month, column }) => (
          <span key={month} style={{ gridColumn: `${column + 1} / span 4` }}>
            {MONTHS[month - 1]}
          </span>
        ))}
      </div>
      <div className="heatmap__weekdays" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <span key={row}>{SHOWN_WEEKDAYS[(row + weekStartsOn) % 7] ?? ''}</span>
        ))}
      </div>
      <div
        className="heatmap__grid"
        role="group"
        aria-label={label}
        ref={nav.containerRef}
        onKeyDown={nav.onKeyDown}
        onMouseLeave={() => setShown(null)}
      >
        {columns.flatMap((column, col) =>
          column.map((key, row) => {
            const day = key ? byDay.get(key) : undefined;
            if (!day) return <span key={`${col}-${row}`} className="heat heat--gap" />;
            return (
              <span
                key={key}
                className={cellClass(day, today)}
                role="img"
                data-row={row}
                data-col={col}
                tabIndex={nav.tabIndexFor(row, col)}
                aria-label={text(day)}
                title={text(day)}
                onFocus={() => {
                  nav.setActive(row, col);
                  setShown(day.day);
                }}
                onBlur={() => setShown(null)}
                onMouseEnter={() => setShown(day.day)}
              />
            );
          }),
        )}
      </div>
      <p className="heatmap__caption" aria-hidden="true">
        {shownDay ? text(shownDay) : ' '}
      </p>
    </div>
  );
}

/** The "Less ▢▢▢▢▢ More" key, in the accent colour. */
export function HeatScale() {
  return (
    <span className="heat-scale" style={{ '--heat': 'var(--accent)' } as CSSProperties}>
      Less
      {[0, 1, 2, 3, 4].map((level) => (
        <span key={level} className={`heat heat--l${level}`} aria-hidden="true" />
      ))}
      More
      <span className="heat-scale__off">
        <span className="heat heat--off" aria-hidden="true" /> Not scheduled
      </span>
    </span>
  );
}
