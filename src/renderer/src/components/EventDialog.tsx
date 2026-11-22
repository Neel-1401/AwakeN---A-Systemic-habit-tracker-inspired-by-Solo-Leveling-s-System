import { useEffect, useRef, useState, type FormEvent } from 'react';
import { describeReminder, formToEvent, type EventForm } from '../../../core/eventForm';
import type { RepeatChoice } from '../../../core/recurrence';
import type { CalendarEvent } from '../../../core/types';
import type { EventInput } from '../../../shared/ipc';
import { errorMessage } from '../lib/format';
import { SegmentedControl } from './SegmentedControl';
import { WarningIcon } from './SyncStatus';
import './HabitDialog.css';
import './EventDialog.css';

interface EventDialogProps {
  initial: EventForm;
  /** The stored event when editing (the whole series for a repeating one), undefined when new. */
  event?: CalendarEvent;
  onClose(): void;
  onSave(input: EventInput): Promise<void>;
  onDelete(id: string): Promise<void>;
}

const KIND_OPTIONS = [
  { value: 'event', label: 'Event' },
  { value: 'task', label: 'Task' },
] as const satisfies readonly { value: CalendarEvent['kind']; label: string }[];

const REPEAT_LABELS: Record<RepeatChoice | 'none', string> = {
  none: 'Doesn’t repeat',
  daily: 'Every day',
  weekly: 'Every week',
  weekdays: 'Every weekday (Mon–Fri)',
  custom: 'Custom (set in Google Calendar)',
};

/** Same limit as main's validation. */
const MAX_REMINDERS = 5;
const REMINDER_PRESETS = [0, 10, 30, 60, 1440];

export function EventDialog({ initial, event, onClose, onSave, onDelete }: EventDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<EventForm>(initial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
    titleRef.current?.focus();
  }, []);

  /** Updates some fields. The spread keeps the rest of the form as it was. */
  const set = (changes: Partial<EventForm>) => setForm((current) => ({ ...current, ...changes }));

  const isTask = form.kind === 'task';
  const noun = isTask ? 'task' : 'event';
  // "Custom" only appears for an event that already has a rule the app can't edit. The picker is
  // then locked, so saving always keeps that rule; it can only be changed in Google Calendar.
  const customRepeat = initial.repeat === 'custom';
  const repeatChoices: (RepeatChoice | 'none')[] = customRepeat
    ? ['custom']
    : ['none', 'daily', 'weekly', 'weekdays'];
  const reminderChoices = [...new Set([...REMINDER_PRESETS, ...form.reminderMinutes])].sort((a, b) => a - b);

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

  function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    const result = formToEvent(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    void run(() => onSave(result.value));
  }

  function toggleReminder(minutes: number) {
    set({
      reminderMinutes: form.reminderMinutes.includes(minutes)
        ? form.reminderMinutes.filter((m) => m !== minutes)
        : [...form.reminderMinutes, minutes],
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="habit-dialog event-dialog"
      aria-labelledby="event-dialog-title"
      onCancel={(cancelEvent) => {
        cancelEvent.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit} noValidate>
        <h2 id="event-dialog-title" className="habit-dialog__title">
          {event ? `Edit ${noun}` : `New ${noun}`}
        </h2>

        {event?.syncState === 'error' && (
          <p className="event-dialog__sync-error">
            <WarningIcon />
            <span>Didn’t sync to Google Calendar. {event.syncError} Saving tries again.</span>
          </p>
        )}

        <label className="field">
          <span className="field__label">Title</span>
          <input
            ref={titleRef}
            className="input"
            value={form.title}
            maxLength={200}
            placeholder={isTask ? 'e.g. Submit lab report' : 'e.g. Algorithms lecture'}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>

        <div className="field">
          <SegmentedControl<CalendarEvent['kind']>
            legend="Type"
            fill
            name="event-kind"
            value={form.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => set({ kind })}
          />
          {isTask && <p className="field__hint">A dated to-do with a tick box. It lasts 30 minutes on the calendar.</p>}
        </div>

        <fieldset className="field">
          <legend className="field__label">When</legend>
          <label className="checkbox">
            <input type="checkbox" checked={form.allDay} onChange={(e) => set({ allDay: e.target.checked })} />
            All day
          </label>
          <div className="event-dialog__when">
            <span className="event-dialog__when-label">{isTask ? 'Due' : 'Starts'}</span>
            <input
              type="date"
              className="input"
              aria-label={isTask ? 'Due date' : 'Start date'}
              value={form.startDay}
              onChange={(e) => {
                // Keep a one-day item one day long when its start date moves.
                const sameDay = form.endDay === form.startDay;
                set({ startDay: e.target.value, ...(sameDay ? { endDay: e.target.value } : {}) });
              }}
            />
            {!form.allDay && (
              <input
                type="time"
                className="input input--time"
                aria-label={isTask ? 'Due time' : 'Start time'}
                value={form.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
              />
            )}
          </div>
          {!isTask && (
            <div className="event-dialog__when">
              <span className="event-dialog__when-label">Ends</span>
              <input
                type="date"
                className="input"
                aria-label="End date"
                value={form.endDay}
                onChange={(e) => set({ endDay: e.target.value })}
              />
              {!form.allDay && (
                <input
                  type="time"
                  className="input input--time"
                  aria-label="End time"
                  value={form.endTime}
                  onChange={(e) => set({ endTime: e.target.value })}
                />
              )}
            </div>
          )}
        </fieldset>

        <label className="field">
          <span className="field__label">Repeat</span>
          <select
            className="input"
            value={form.repeat ?? 'none'}
            disabled={customRepeat}
            aria-describedby={customRepeat ? 'event-repeat-hint' : undefined}
            onChange={(e) => {
              const value = e.target.value as RepeatChoice | 'none';
              set({ repeat: value === 'none' ? null : value });
            }}
          >
            {repeatChoices.map((choice) => (
              <option key={choice} value={choice}>
                {REPEAT_LABELS[choice]}
              </option>
            ))}
          </select>
          {customRepeat && (
            <span id="event-repeat-hint" className="field__hint">
              This repeat can only be changed in Google Calendar. Saving here keeps it.
            </span>
          )}
          {event?.recurrenceRule && <span className="field__hint">Changes apply to every repeat.</span>}
        </label>

        <fieldset className="field">
          <legend className="field__label">Reminders</legend>
          <div className="toggle-chips" role="group" aria-label="Reminders">
            {reminderChoices.map((minutes) => {
              const on = form.reminderMinutes.includes(minutes);
              return (
                <button
                  key={minutes}
                  type="button"
                  className="toggle-chip"
                  aria-pressed={on}
                  disabled={!on && form.reminderMinutes.length >= MAX_REMINDERS}
                  onClick={() => toggleReminder(minutes)}
                >
                  {describeReminder(minutes)}
                </button>
              );
            })}
          </div>
          <span className="field__hint">Google Calendar sends these to your phone once the event syncs.</span>
        </fieldset>

        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            className="input event-dialog__description"
            rows={3}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </label>

        {error && (
          <p className="habit-dialog__error" role="alert">
            {error}
          </p>
        )}

        {confirmingDelete && event ? (
          <div className="habit-dialog__confirm" role="alertdialog" aria-labelledby="event-confirm-text">
            <p id="event-confirm-text">
              Delete “{event.title}”?{event.recurrenceRule ? ' Every repeat is deleted too.' : ''}
            </p>
            <div className="habit-dialog__buttons">
              <button type="button" className="button" disabled={busy} onClick={() => setConfirmingDelete(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={busy}
                onClick={() => void run(() => onDelete(event.id))}
              >
                Delete {noun}
              </button>
            </div>
          </div>
        ) : (
          <div className="habit-dialog__footer">
            {event && (
              <div className="habit-dialog__buttons">
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
              <button type="submit" className="button button--primary" disabled={busy}>
                Save {noun}
              </button>
            </div>
          </div>
        )}
      </form>
    </dialog>
  );
}
