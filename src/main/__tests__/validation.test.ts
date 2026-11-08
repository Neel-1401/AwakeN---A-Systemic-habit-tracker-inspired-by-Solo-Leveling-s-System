import { describe, expect, it } from 'vitest';
import {
  parseDayKey,
  parseDayRange,
  parseHabitInput,
  parseId,
  parseReminderTime,
  parseSettingsChanges,
  ValidationError,
} from '../validation';

const valid = { name: 'Gym', color: '#A0674B', frequency: 'daily', reminderTime: null };

describe('parseHabitInput', () => {
  it('accepts a valid habit and trims the name', () => {
    expect(parseHabitInput({ ...valid, name: '  Gym  ' })).toEqual({
      name: 'Gym',
      color: '#A0674B',
      frequency: 'daily',
      weekdays: undefined,
      reminderTime: null,
    });
  });

  it('rejects a missing, blank or overlong name', () => {
    expect(() => parseHabitInput({ ...valid, name: undefined })).toThrow('Name is required');
    expect(() => parseHabitInput({ ...valid, name: '   ' })).toThrow('Name is required');
    expect(() => parseHabitInput({ ...valid, name: 'x'.repeat(81) })).toThrow('80 characters');
  });

  it('only accepts the eight palette colours', () => {
    expect(() => parseHabitInput({ ...valid, color: '#FF0000' })).toThrow('Unknown colour');
    expect(() => parseHabitInput({ ...valid, color: '#a0674b' })).toThrow('Unknown colour');
    for (const color of ['#4F7A6B', '#5B6F8C', '#A3843A', '#7D5A7A', '#3D7C84', '#A35C67', '#6E6E6E']) {
      expect(parseHabitInput({ ...valid, color }).color).toBe(color);
    }
  });

  it('rejects an unknown frequency', () => {
    expect(() => parseHabitInput({ ...valid, frequency: 'monthly' })).toThrow('repeat');
  });

  it('requires weekdays for chosen-day habits, and sorts and dedupes them', () => {
    const chosen = { ...valid, frequency: 'weekdays' };
    expect(() => parseHabitInput(chosen)).toThrow('at least one day');
    expect(() => parseHabitInput({ ...chosen, weekdays: [] })).toThrow('at least one day');
    expect(() => parseHabitInput({ ...chosen, weekdays: [7] })).toThrow('0 (Sunday) to 6');
    expect(() => parseHabitInput({ ...chosen, weekdays: [1.5] })).toThrow('0 (Sunday) to 6');
    expect(parseHabitInput({ ...chosen, weekdays: [5, 1, 3, 1] }).weekdays).toEqual([1, 3, 5]);
  });

  it('drops weekdays for other frequencies', () => {
    expect(parseHabitInput({ ...valid, weekdays: [1, 2] }).weekdays).toBeUndefined();
  });

  it('rejects input that is not an object', () => {
    for (const input of [null, undefined, 'Gym', ['Gym']]) {
      expect(() => parseHabitInput(input)).toThrow(ValidationError);
    }
  });
});

describe('parseReminderTime', () => {
  it('accepts HH:mm or no reminder', () => {
    expect(parseReminderTime('00:00')).toBe('00:00');
    expect(parseReminderTime('18:05')).toBe('18:05');
    expect(parseReminderTime('23:59')).toBe('23:59');
    expect(parseReminderTime(null)).toBeNull();
    expect(parseReminderTime(undefined)).toBeNull();
  });

  it('rejects anything else', () => {
    for (const time of ['24:00', '9:30', '09:60', '09:30:00', '', 930]) {
      expect(() => parseReminderTime(time)).toThrow('HH:mm');
    }
  });
});

describe('parseDayKey and parseDayRange', () => {
  it('accepts real YYYY-MM-DD days only', () => {
    expect(parseDayKey('2026-03-05')).toBe('2026-03-05');
    for (const day of ['2026-02-30', '2026-3-5', '2026-03-05T00:00', '', 20260305]) {
      expect(() => parseDayKey(day)).toThrow(ValidationError);
    }
  });

  it('requires the range to be in order', () => {
    expect(parseDayRange('2026-03-01', '2026-03-01')).toEqual(['2026-03-01', '2026-03-01']);
    expect(() => parseDayRange('2026-03-02', '2026-03-01')).toThrow('after');
  });
});

describe('parseId', () => {
  it('accepts UUIDs only', () => {
    expect(parseId('6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f')).toBe(
      '6f1c2a7e-3b4d-4c5e-8f90-1a2b3c4d5e6f'
    );
    expect(() => parseId("1' OR '1'='1")).toThrow('Invalid id');
    expect(() => parseId(42)).toThrow('Invalid id');
  });
});

describe('parseSettingsChanges', () => {
  it('accepts known themes and week starts, and ignores missing fields', () => {
    expect(parseSettingsChanges({ theme: 'dark' })).toEqual({ theme: 'dark' });
    expect(parseSettingsChanges({ weekStartsOn: 0 })).toEqual({ weekStartsOn: 0 });
    expect(parseSettingsChanges({ habitsView: 'month' })).toEqual({ habitsView: 'month' });
    expect(parseSettingsChanges({})).toEqual({});
  });

  it('rejects anything else', () => {
    expect(() => parseSettingsChanges({ theme: 'purple' })).toThrow('Theme');
    expect(() => parseSettingsChanges({ weekStartsOn: 3 })).toThrow('Week');
    expect(() => parseSettingsChanges({ weekStartsOn: '1' })).toThrow('Week');
    expect(() => parseSettingsChanges({ habitsView: 'week' })).toThrow('Habits view');
    expect(() => parseSettingsChanges(null)).toThrow(ValidationError);
  });
});
