import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { WeekStartsOn } from '../../../core/dates';
import { DEFAULT_HABIT_COLOR, HABIT_COLORS, type HabitColor } from '../../../core/palette';
import type { Habit } from '../../../core/types';
import type { HabitInput } from '../../../shared/ipc';
import { errorMessage, orderedWeekdays, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../lib/format';
import { SegmentedControl } from './SegmentedControl';
import './HabitDialog.css';

interface HabitDialogProps {
  /** The habit being edited, or undefined when adding a new one. */
  habit?: Habit;
  weekStartsOn: WeekStartsOn;
  onClose(): void;
  onSave(input: HabitInput): Promise<void>;
  onArchive(id: string): Promise<void>;
  onDelete(id: string): Promise<void>;
}

const REPEAT_OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Chosen days' },
  { value: 'weekly', label: 'Once a week' },
] as const;

const DEFAULT_REMINDER = '09:00';

export function HabitDialog({ habit, weekStartsOn, onClose, onSave, onArchive, onDelete }: HabitDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(habit?.name ?? '');
  const [color, setColor] = useState<HabitColor>(habit?.color ?? DEFAULT_HABIT_COLOR);
  const [frequency, setFrequency] = useState<Habit['frequency']>(habit?.frequency ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(habit?.weekdays ?? []);
  const [remind, setRemind] = useState(Boolean(habit?.reminderTime));
  const [reminderTime, setReminderTime] = useState(habit?.reminderTime ?? DEFAULT_REMINDER);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs point at the real DOM elements. showModal() is a DOM method, not something React does,
  // so it runs in an effect after the dialog is on the page.
  useEffect(() => {
    dialogRef.current?.showModal();
    nameRef.current?.focus();
  }, []);

  const needsDays = frequency === 'weekdays' && weekdays.length === 0;
  const canSave = name.trim().length > 0 && !needsDays && (!remind || reminderTime !== '') && !busy;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    void run(() =>
      onSave({
        name: name.trim(),
        color,
        frequency,
        weekdays: frequency === 'weekdays' ? weekdays : undefined,
        reminderTime: remind ? reminderTime : null,
      })
    );
  }

  function toggleWeekday(day: number) {
    setWeekdays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  return (
    <dialog
      ref={dialogRef}
      className="habit-dialog"
      aria-labelledby="habit-dialog-title"
      // Esc fires "cancel". We stop the browser closing it by itself and let React close it,
      // so React's state and the page always agree.
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} noValidate>
        <h2 id="habit-dialog-title" className="habit-dialog__title">
          {habit ? 'Edit habit' : 'New habit'}
        </h2>

        <label className="field">
          <span className="field__label">Name</span>
          <input
            ref={nameRef}
            className="input"
            value={name}
            maxLength={80}
            placeholder="e.g. Read 10 pages"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <fieldset className="field">
          <legend className="field__label">Colour</legend>
          <div className="swatches">
            {HABIT_COLORS.map((swatch) => (
              <label key={swatch.hex} className="swatch" style={{ '--swatch': swatch.hex } as CSSProperties}>
                <input
                  type="radio"
                  name="habit-color"
                  checked={color === swatch.hex}
                  onChange={() => setColor(swatch.hex)}
                  aria-label={swatch.name}
                />
                <span className="swatch__dot" aria-hidden="true">
                  <svg viewBox="0 0 16 16">
                    <path d="M4 8.5l2.5 2.5L12 5.5" />
                  </svg>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <SegmentedControl<Habit['frequency']>
            legend="Repeat"
            name="habit-repeat"
            value={frequency}
            options={REPEAT_OPTIONS}
            onChange={setFrequency}
          />
          {frequency === 'weekdays' && (
            <div className="weekday-chips" role="group" aria-label="Days">
              {orderedWeekdays(weekStartsOn).map((day) => (
                <button
                  key={day}
                  type="button"
                  className="weekday-chip"
                  aria-pressed={weekdays.includes(day)}
                  aria-label={WEEKDAY_NAMES[day]}
                  onClick={() => toggleWeekday(day)}
                >
                  {WEEKDAY_SHORT[day]}
                </button>
              ))}
            </div>
          )}
          {needsDays && <p className="field__hint">Choose at least one day.</p>}
          {frequency === 'weekly' && <p className="field__hint">Done on any day of the week.</p>}
        </div>

        <div className="field field--inline">
          <label className="checkbox">
            <input type="checkbox" checked={remind} onChange={(event) => setRemind(event.target.checked)} />
            Remind me at
          </label>
          <input
            type="time"
            className="input input--time"
            aria-label="Reminder time"
            value={reminderTime}
            disabled={!remind}
            onChange={(event) => setReminderTime(event.target.value)}
          />
        </div>

        {error && (
          <p className="habit-dialog__error" role="alert">
            {error}
          </p>
        )}

        {confirmingDelete && habit ? (
          <div className="habit-dialog__confirm" role="alertdialog" aria-labelledby="confirm-text">
            <p id="confirm-text">
              Delete “{habit.name}”? It disappears from every view, and this can’t be undone from the
              app. To keep its history, archive it instead.
            </p>
            <div className="habit-dialog__buttons">
              <button type="button" className="button" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={busy}
                onClick={() => void run(() => onDelete(habit.id))}
              >
                Delete habit
              </button>
            </div>
          </div>
        ) : (
          <div className="habit-dialog__footer">
            {habit && (
              <div className="habit-dialog__buttons">
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => void run(() => onArchive(habit.id))}
                >
                  Archive
                </button>
                <button
                  type="button"
                  className="button button--quiet button--danger-text"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </button>
              </div>
            )}
            <div className="habit-dialog__buttons habit-dialog__buttons--end">
              <button type="button" className="button" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={!canSave}>
                Save
              </button>
            </div>
          </div>
        )}
      </form>
    </dialog>
  );
}
