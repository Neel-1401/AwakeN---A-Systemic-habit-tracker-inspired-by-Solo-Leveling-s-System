export interface Habit {
  id: string;
  name: string;
  frequency: 'daily' | 'weekdays' | 'weekly';
  weekdays?: number[]; // 0 = Sunday ... 6 = Saturday
  // Optional until Phase 3 adds these columns and the repository fills them in.
  color?: string;
  reminderTime?: string | null; // HH:mm
  startDate?: string; // YYYY-MM-DD
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  kind: 'event' | 'task';
  completedAt?: string | null;
  reminderMinutes: number[];
  recurrenceRule?: string | null;
  googleEventId?: string | null;
  googleEtag?: string | null;
  syncState: 'local' | 'synced' | 'pending' | 'error';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}
