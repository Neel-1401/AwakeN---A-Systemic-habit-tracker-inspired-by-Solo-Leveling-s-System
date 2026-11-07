/** The colours a habit can have. Stored as the hex value. */
export const HABIT_COLORS = [
  { name: 'sage', hex: '#4F7A6B' },
  { name: 'slate', hex: '#5B6F8C' },
  { name: 'clay', hex: '#A0674B' },
  { name: 'ochre', hex: '#A3843A' },
  { name: 'plum', hex: '#7D5A7A' },
  { name: 'teal', hex: '#3D7C84' },
  { name: 'rose', hex: '#A35C67' },
  { name: 'graphite', hex: '#6E6E6E' },
] as const;

export type HabitColor = (typeof HABIT_COLORS)[number]['hex'];

export const DEFAULT_HABIT_COLOR: HabitColor = '#4F7A6B';

export function isHabitColor(value: unknown): value is HabitColor {
  return HABIT_COLORS.some((color) => color.hex === value);
}
