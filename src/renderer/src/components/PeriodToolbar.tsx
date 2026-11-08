import type { ReactNode } from 'react';
import './PeriodToolbar.css';

interface PeriodToolbarProps {
  /** e.g. "November 2026" or "2026" */
  label: string;
  /** e.g. "month" or "year", used in the arrow buttons' accessible names */
  unit: string;
  onPrevious(): void;
  onNext(): void;
  /** "This month" / "This year". Shown only when it would change something. */
  resetLabel: string;
  onReset?: () => void;
  /** The legend or scale on the right. */
  children?: ReactNode;
}

export function PeriodToolbar({ label, unit, onPrevious, onNext, resetLabel, onReset, children }: PeriodToolbarProps) {
  return (
    <div className="period-toolbar">
      <div className="period-toolbar__nav">
        <button type="button" className="button button--icon" aria-label={`Previous ${unit}`} onClick={onPrevious}>
          ‹
        </button>
        {/* aria-live announces the new period after the arrows are pressed. */}
        <h2 className="period-toolbar__label" aria-live="polite">
          {label}
        </h2>
        <button type="button" className="button button--icon" aria-label={`Next ${unit}`} onClick={onNext}>
          ›
        </button>
        {onReset && (
          <button type="button" className="button" onClick={onReset}>
            {resetLabel}
          </button>
        )}
      </div>
      {children && <div className="period-toolbar__extra">{children}</div>}
    </div>
  );
}
