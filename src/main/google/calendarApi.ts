/** The primary calendar's events in the Calendar REST API (v3). */
export const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export const eventUrl = (googleEventId: string) => `${EVENTS_URL}/${encodeURIComponent(googleEventId)}`;

export interface CalendarRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
}

/**
 * How a request to Google went, without exceptions:
 * - response: Google answered, with any HTTP status (401 and 412 included).
 * - offline: no answer at all (no network, DNS failed, timed out).
 * - signed-out: not connected, or Google refused the sign-in itself (invalid_grant).
 */
export type CalendarReply =
  | { kind: 'response'; status: number; data: unknown }
  | { kind: 'offline' }
  | { kind: 'signed-out' };

/**
 * The HTTP layer the push queue talks through. GoogleAuth implements it with the signed-in
 * OAuth2Client; tests pass a fake that answers like Google would.
 */
export interface CalendarTransport {
  send(request: CalendarRequest): Promise<CalendarReply>;
  /** Throws the access token away and gets a new one with the refresh token. */
  refreshAccess(): Promise<'ok' | 'offline' | 'signed-out'>;
  /** Google still said 401 with a fresh token: stop using this sign-in (Settings shows Reconnect). */
  rejectSignIn(): void;
}

/** Google's own explanation from an error response, if it gave one. Never contains our tokens. */
export function googleErrorMessage(data: unknown): string | null {
  const error = (data as { error?: unknown } | null)?.error;
  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return typeof error === 'string' ? error : null;
}

/** Google's machine-readable reason, e.g. 'rateLimitExceeded'. */
export function googleErrorReason(data: unknown): string | null {
  const errors = ((data as { error?: { errors?: unknown } } | null)?.error as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(errors)) return null;
  const reason = (errors[0] as { reason?: unknown } | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}
