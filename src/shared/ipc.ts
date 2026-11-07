import type { HabitColor } from '../core/palette';
import type { Habit, HabitLog } from '../core/types';

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
}

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
}
