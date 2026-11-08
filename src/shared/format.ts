import { format } from 'date-fns';

/** "18:05" → "6:05 pm". Shared so notifications and the Today card read the same. */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return format(new Date(2000, 0, 1, hours, minutes), 'h:mm a').toLowerCase();
}
