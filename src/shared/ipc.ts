import type { WeekStartsOn } from '../core/dates';
import type { HabitColor } from '../core/palette';
import type { RepeatKind } from '../core/recurrence';
import type { CalendarEvent, Habit, HabitLog } from '../core/types';

/** What the New/Edit habit dialog sends. Create and update take the same shape. */
export interface HabitInput {
  name: string;
  color: HabitColor;
  frequency: Habit['frequency'];
  /** Required (and non-empty) when frequency is 'weekdays', ignored otherwise. */
  weekdays?: number[];
  /** 'HH:mm' in local time, or null for no reminder. */
  reminderTime: string | null;
}

/**
 * What the event dialog sends. Create and update take the same shape.
 * Timed events: startAt / endAt are ISO date-times (stored as UTC).
 * All-day events: startAt / endAt are 'YYYY-MM-DD', with endAt exclusive (a one-day event on the
 * 9th is 9th → 10th).
 */
export interface EventInput {
  title: string;
  description: string | null;
  kind: CalendarEvent['kind'];
  allDay: boolean;
  startAt: string;
  endAt: string;
  /** null = doesn't repeat. Stored as Google's RRULE text. */
  repeat: RepeatKind | null;
  /** Minutes before the start. Sent to Google as popup reminders in Phase 6. */
  reminderMinutes: number[];
}

/** One occurrence of an event in a date range, as the calendar views draw it. */
export interface EventOccurrenceDto {
  event: CalendarEvent;
  /** The local day this occurrence starts on. Pass it to toggleTaskDone for repeating tasks. */
  day: string;
  /** Timed: UTC ISO. All-day: day key. */
  startAt: string;
  /** Timed: UTC ISO. All-day: day key, exclusive. */
  endAt: string;
  /** Tasks: whether this occurrence is done. Always false for events. */
  done: boolean;
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type HabitsView = 'today' | 'month' | 'year';

export interface AppSettings {
  theme: ThemeSetting;
  /** 1 = Monday, 0 = Sunday */
  weekStartsOn: WeekStartsOn;
  /** The Habits tab that was open last. */
  habitsView: HabitsView;
  /** Show desktop notifications for habit reminders. */
  habitNotifications: boolean;
}

/**
 * Every IPC channel, with the arguments the renderer sends and what main sends back.
 * Preload and main are both typed from this one map, so they can't drift apart.
 */
export interface IpcContract {
  'habits:list': { args: []; result: Habit[] };
  'habits:create': { args: [input: HabitInput]; result: Habit };
  'habits:update': { args: [id: string, input: HabitInput]; result: Habit };
  'habits:archive': { args: [id: string]; result: Habit };
  'habits:restore': { args: [id: string]; result: Habit };
  'habits:delete': { args: [id: string]; result: void };
  /** Completes the day, or undoes it if already complete. Returns the log after the change. */
  'habits:toggleLog': { args: [habitId: string, dayKey: string]; result: HabitLog };
  /** Live completions from fromDayKey to toDayKey inclusive, for habits that aren't deleted. */
  'habits:getLogs': { args: [fromDayKey: string, toDayKey: string]; result: HabitLog[] };
  'settings:get': { args: []; result: AppSettings };
  /** Changes only the fields given. Returns all settings after the change. */
  'settings:update': { args: [changes: Partial<AppSettings>]; result: AppSettings };
  /** Occurrences overlapping fromDayKey..toDayKey (inclusive, local days), repeats expanded. */
  'events:listInRange': { args: [fromDayKey: string, toDayKey: string]; result: EventOccurrenceDto[] };
  'events:create': { args: [input: EventInput]; result: CalendarEvent };
  /** Repeating events: changes the whole series. */
  'events:update': { args: [id: string, input: EventInput]; result: CalendarEvent };
  /** Soft delete. Repeating events: deletes the whole series. */
  'events:delete': { args: [id: string]; result: void };
  /** Tasks only. Repeating tasks need the occurrence day. Returns whether it's done afterwards. */
  'events:toggleTaskDone': { args: [id: string, occurrenceDay?: string]; result: boolean };
  /** Development builds only: shows a sample reminder notification straight away. */
  'reminders:test': { args: []; result: void };
}

/** Messages main sends to the window (the other direction from IpcContract). */
export const MainEvents = {
  /** A reminder notification was clicked: show the Today tab. */
  showToday: 'app:showToday',
} as const;

export type IpcChannel = keyof IpcContract;

/** What the renderer sees as `window.api`. */
export interface AwakenApi {
  habits: {
    list(): Promise<Habit[]>;
    create(input: HabitInput): Promise<Habit>;
    update(id: string, input: HabitInput): Promise<Habit>;
    archive(id: string): Promise<Habit>;
    restore(id: string): Promise<Habit>;
    delete(id: string): Promise<void>;
    toggleLog(habitId: string, dayKey: string): Promise<HabitLog>;
    getLogs(fromDayKey: string, toDayKey: string): Promise<HabitLog[]>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(changes: Partial<AppSettings>): Promise<AppSettings>;
  };
  calendar: {
    listInRange(fromDayKey: string, toDayKey: string): Promise<EventOccurrenceDto[]>;
    create(input: EventInput): Promise<CalendarEvent>;
    update(id: string, input: EventInput): Promise<CalendarEvent>;
    delete(id: string): Promise<void>;
    toggleTaskDone(id: string, occurrenceDay?: string): Promise<boolean>;
  };
  reminders: {
    /** Development builds only. */
    test(): Promise<void>;
  };
  events: {
    /** Calls `listener` when main asks for the Today tab. Returns a function that unsubscribes. */
    onShowToday(listener: () => void): () => void;
  };
}
