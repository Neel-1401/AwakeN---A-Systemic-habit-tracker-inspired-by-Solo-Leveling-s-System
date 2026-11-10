import type { CSSProperties } from 'react';
import type { TodayReminder } from '../../../core/reminders';
import type { Habit } from '../../../core/types';
import { formatCountdown, formatTime } from '../lib/format';
import './RemindersCard.css';

interface RemindersCardProps {
  reminders: TodayReminder[];
  habits: ReadonlyMap<string, Habit>;
}

const STATUS_TEXT = { done: 'Done', due: 'Due' } as const;

export function RemindersCard({ reminders, habits }: RemindersCardProps) {
  return (
    <section aria-labelledby="reminders-title">
      <h2 id="reminders-title" className="section-title">
        Reminders today
      </h2>
      <div className="reminders card">
        <ul className="reminders__list">
          {reminders.map((reminder) => {
            const habit = habits.get(reminder.habitId);
            if (!habit) return null;
            const status =
              reminder.status === 'upcoming'
                ? formatCountdown(reminder.minutesUntil)
                : STATUS_TEXT[reminder.status];
            return (
              <li
                key={reminder.habitId}
                className={`reminder-pill reminder-pill--${reminder.status}`}
                style={{ '--habit': habit.color } as CSSProperties}
              >
                <span className="dot" aria-hidden="true" />
                <span className="reminder-pill__name">{habit.name}</span>
                <span className="reminder-pill__time">{formatTime(reminder.time)}</span>
                <span className="reminder-pill__status">{status}</span>
              </li>
            );
          })}
        </ul>
        <p className="note">You get a desktop notification at each time while AwakeN is open.</p>
      </div>
    </section>
  );
}
