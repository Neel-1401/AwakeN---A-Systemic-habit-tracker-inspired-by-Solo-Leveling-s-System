import type { WeekStartsOn } from '../core/dates';
import type { HabitColor } from '../core/palette';
import type { RepeatChoice } from '../core/recurrence';
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
  /**
   * null = doesn't repeat. Stored as Google's RRULE text.
   * 'custom' (updates only) keeps the event's existing rule unchanged, so saving an event whose
   * rule the app can't edit never drops its repeats.
   */
  repeat: RepeatChoice | null;
  /** Minutes before the start. Sent to Google as popup reminders. */
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
 * The Google Calendar connection as Settings shows it. Tokens never leave main: this only says
 * which account is connected and whether its sign-in still works.
 */
export type GoogleStatus = {
  /** A one-off message about what just happened, e.g. "Google sign-in was cancelled." */
  notice?: string;
} & (
  /** .env has no GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, so sign-in can't start. */
  | { state: 'not-configured' }
  | { state: 'not-connected' }
  /** The sign-in page is open in the browser and AwakeN is waiting for Google's reply. */
  | { state: 'connecting' }
  | { state: 'connected'; email: string }
  /** Google refused the stored sign-in: revoked, or a Testing-mode token older than ~7 days. */
  | { state: 'needs-reconnect'; email: string }
);

export type GoogleState = GoogleStatus['state'];

/**
 * Pushing events to Google, as the Calendar toolbar and Settings show it.
 * Built in main from the database and the push queue; contains no event contents.
 */
export interface SyncStatus {
  /** 'off': Google isn't connected, nothing syncs. 'needs-reconnect': paused until you reconnect. */
  connection: 'off' | 'on' | 'needs-reconnect';
  /** Changes (including deletes) waiting to reach Google. */
  pending: number;
  /** Events Google refused; each has an error message (see sync:listFailed). */
  failed: number;
  /** When everything waiting last reached Google. ISO, or null if never. */
  lastSyncedAt: string | null;
  /** The last try couldn't reach Google. Changes wait and go when it's back. */
  offline: boolean;
  /** Just connected with this many existing events: ask whether to upload them. */
  uploadOffer: number | null;
  /** Events only in AwakeN (made before connecting, or "Not now"). */
  localOnly: number;
}

/** One event that failed to sync, for the list behind "1 event failed to sync". */
export interface FailedSyncItem {
  id: string;
  title: string;
  /** Timed: UTC ISO. All-day: day key. */
  startAt: string;
  allDay: boolean;
  /** Deleted in AwakeN, but Google refused the delete. */
  deleted: boolean;
  error: string;
}

/** Result of the dev-only "Test connection" button. */
export interface GoogleTestResult {
  ok: boolean;
  message: string;
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
  /** Development builds only: fills an empty database with sample habits and events. */
  'dev:seedSample': { args: []; result: { habits: number; events: number } };
  'google:getStatus': { args: []; result: GoogleStatus };
  /**
   * Opens Google's sign-in page in the browser and resolves once the user comes back, gives up,
   * or 5 minutes pass. Statuses along the way also arrive through onGoogleStatus.
   */
  'google:connect': { args: []; result: GoogleStatus };
  /** Stops waiting for a sign-in started by google:connect. */
  'google:cancelConnect': { args: []; result: void };
  /** Revokes access with Google and forgets the sign-in. Local events are left alone. */
  'google:disconnect': { args: []; result: GoogleStatus };
  /** Development builds only: lists one upcoming event from the primary calendar. */
  'google:testConnection': { args: []; result: GoogleTestResult };
  'sync:getStatus': { args: []; result: SyncStatus };
  'sync:listFailed': { args: []; result: FailedSyncItem[] };
  /** Puts a failed event back in the queue and tries it straight away. */
  'sync:retry': { args: [id: string]; result: void };
  /** The answer to "Upload N existing events?": true uploads them, false leaves them local. */
  'sync:answerUpload': { args: [upload: boolean]; result: void };
  /** Settings: uploads every event that's only in AwakeN. Returns how many were queued. */
  'sync:uploadLocal': { args: []; result: number };
}

/** Messages main sends to the window (the other direction from IpcContract). */
export const MainEvents = {
  /** A reminder notification was clicked: show the Today tab. */
  showToday: 'app:showToday',
  /** The Google connection changed (sent with the new GoogleStatus). */
  googleStatus: 'google:status',
  /** Push sync progressed: counts or an event's syncState changed (sent with the SyncStatus). */
  syncStatus: 'sync:status',
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
  dev: {
    /** Development builds only. Refuses unless there are no habits and no events. */
    seedSample(): Promise<{ habits: number; events: number }>;
  };
  google: {
    getStatus(): Promise<GoogleStatus>;
    connect(): Promise<GoogleStatus>;
    cancelConnect(): Promise<void>;
    disconnect(): Promise<GoogleStatus>;
    /** Development builds only. */
    testConnection(): Promise<GoogleTestResult>;
  };
  sync: {
    getStatus(): Promise<SyncStatus>;
    listFailed(): Promise<FailedSyncItem[]>;
    retry(id: string): Promise<void>;
    answerUpload(upload: boolean): Promise<void>;
    uploadLocal(): Promise<number>;
  };
  events: {
    /** Calls `listener` when main asks for the Today tab. Returns a function that unsubscribes. */
    onShowToday(listener: () => void): () => void;
    /** Calls `listener` whenever the Google connection changes. Returns an unsubscribe function. */
    onGoogleStatus(listener: (status: GoogleStatus) => void): () => void;
    /** Calls `listener` whenever push sync changes something. Returns an unsubscribe function. */
    onSyncStatus(listener: (status: SyncStatus) => void): () => void;
  };
}
