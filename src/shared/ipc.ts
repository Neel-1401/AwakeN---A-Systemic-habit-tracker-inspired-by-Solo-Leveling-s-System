import type { Habit } from '../core/types';

export const IpcChannels = {
  habitsCreate: 'habits:create',
  habitsList: 'habits:list',
} as const;

export interface HabitsCreateRequest {
  name: string;
  frequency: Habit['frequency'];
  weekdays?: number[];
}

export interface AwakenApi {
  habits: {
    create(input: HabitsCreateRequest): Promise<Habit>;
    list(): Promise<Habit[]>;
  };
}
