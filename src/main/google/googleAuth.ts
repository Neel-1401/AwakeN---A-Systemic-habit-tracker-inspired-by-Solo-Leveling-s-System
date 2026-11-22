import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import type { GoogleStatus, GoogleTestResult } from '../../shared/ipc';
import { EVENTS_URL, type CalendarReply, type CalendarRequest, type CalendarTransport } from './calendarApi';
import type { GoogleClientConfig } from './config';
import { CALENDAR_SCOPE, createAuthRequest, GOOGLE_SCOPES, startLoopback, type Loopback, type SignInOutcome } from './oauth';
import { SecureStorageError, type StoredGoogleAccount, type TokenStore } from './tokenStore';

/** Every call to Google gives up after this long, so nothing waits forever when offline. */
const REQUEST_TIMEOUT_MS = 15_000;

/** The parts of OAuth2Client this uses. Tests pass a fake. */
export type GoogleClient = Pick<
  OAuth2Client,
  | 'generateCodeVerifierAsync'
  | 'generateAuthUrl'
  | 'getToken'
  | 'verifyIdToken'
  | 'setCredentials'
  | 'getAccessToken'
  | 'revokeToken'
  | 'request'
  | 'on'
>;

/** Our own small slice of the Calendar API's events.list response. */
interface CalendarEventList {
  items?: { summary?: string; start?: { date?: string; dateTime?: string } }[];
}

export interface GoogleAuthOptions {
  /** null when .env has no client ID/secret. */
  config: GoogleClientConfig | null;
  store: TokenStore;
  /** Opens a URL in the user's normal browser (Electron's shell.openExternal). */
  openExternal(url: string): Promise<void>;
  /** Called whenever the status changes, so main can tell the window. */
  onStatus?(status: GoogleStatus): void;
  createClient?(config: GoogleClientConfig): GoogleClient;
  signInTimeoutMs?: number;
}

interface Attempt {
  cancelled: boolean;
  loopback?: Loopback;
}

export function createOAuthClient({ clientId, clientSecret }: GoogleClientConfig): GoogleClient {
  return new OAuth2Client({ clientId, clientSecret, transporterOptions: { timeout: REQUEST_TIMEOUT_MS } });
}

/**
 * Owns the Google sign-in, in main only. The refresh token is kept by the TokenStore (encrypted
 * file) and the client; the access token lives only in the client's memory and is refreshed by the
 * library when it expires. Nothing here returns or logs a token.
 */
export class GoogleAuth implements CalendarTransport {
  private readonly client: GoogleClient | null;
  private account: StoredGoogleAccount | null;
  private attempt: Attempt | null = null;
  /** True while a sign-in code is swapped for tokens (the client fires 'tokens' then too). */
  private exchanging = false;

  constructor(private readonly options: GoogleAuthOptions) {
    this.client = options.config ? (options.createClient ?? createOAuthClient)(options.config) : null;
    this.account = this.client ? options.store.load() : null;
    if (this.client && this.account?.refreshToken) {
      this.client.setCredentials({ refresh_token: this.account.refreshToken });
    }
    // Google may send a new refresh token with a refresh; keep the newest one.
    this.client?.on('tokens', (tokens) => {
      if (this.exchanging || !this.account?.refreshToken || !tokens.refresh_token) return;
      this.saveAccount({ ...this.account, refreshToken: tokens.refresh_token });
    });
  }

  /** The current status. Notices (what just happened) only come with action results and pushes. */
  getStatus(): GoogleStatus {
    if (!this.client) return { state: 'not-configured' };
    if (this.attempt) return { state: 'connecting' };
    if (this.account?.refreshToken) return { state: 'connected', email: this.account.email };
    if (this.account) return { state: 'needs-reconnect', email: this.account.email };
    return { state: 'not-connected' };
  }

  /**
   * Opens Google's sign-in page and waits for the reply. A second call cancels the first. Always
   * resolves (never throws): problems come back as a notice on the status.
   */
  async connect(): Promise<GoogleStatus> {
    const client = this.client;
    if (!client) return this.getStatus();
    this.cancelConnect();
    const attempt: Attempt = { cancelled: false };
    this.attempt = attempt;
    this.emit(this.getStatus());

    let notice: string | undefined;
    try {
      notice = await this.signIn(client, attempt);
    } catch (error) {
      notice = `Couldn’t connect. ${describeGoogleError(error)}`;
    } finally {
      if (this.attempt === attempt) this.attempt = null;
    }
    // A newer attempt took over: it reports its own result.
    if (this.attempt) return this.getStatus();
    return this.emit(this.statusWith(notice));
  }

  /** Stops waiting for Google. connect() then resolves with "Sign-in cancelled." */
  cancelConnect(): void {
    const attempt = this.attempt;
    if (!attempt) return;
    attempt.cancelled = true;
    attempt.loopback?.cancel();
  }

  /**
   * Forgets the sign-in here first, then asks Google to revoke it. Local events are untouched.
   * If Google can't be reached it's still disconnected here, and the notice says so.
   */
  async disconnect(): Promise<GoogleStatus> {
    const client = this.client;
    if (!client) return this.getStatus();
    this.cancelConnect();
    const refreshToken = this.account?.refreshToken ?? null;
    this.options.store.clear();
    this.account = null;
    client.setCredentials({});

    let notice = 'Disconnected. Your events in AwakeN haven’t changed.';
    if (refreshToken && !(await this.revoke(client, refreshToken))) {
      notice =
        'Disconnected here, but Google couldn’t be reached to revoke access. You can remove AwakeN at myaccount.google.com/permissions.';
    }
    return this.emit(this.statusWith(notice));
  }

  /**
   * True while an account is linked, even if its sign-in expired: local changes are then queued
   * for Google ('pending') and go up after reconnecting. False when never connected or disconnected.
   */
  hasAccount(): boolean {
    return Boolean(this.client && this.account);
  }

  /** Calendar requests go out only when this is true. */
  isConnected(): boolean {
    return Boolean(this.client && this.account?.refreshToken);
  }

  /**
   * One Calendar API request for the push queue. Every HTTP status comes back as a response
   * (validateStatus accepts them all), so 401 and 412 are the queue's to handle, and the library
   * doesn't retry on its own. Errors never escape: their request options include our headers.
   */
  async send({ method, url, data, headers }: CalendarRequest): Promise<CalendarReply> {
    const client = this.client;
    const refreshToken = this.account?.refreshToken;
    if (!client || !refreshToken) return { kind: 'signed-out' };
    try {
      const response = await client.request({ method, url, data, headers, validateStatus: () => true });
      return { kind: 'response', status: response.status, data: response.data };
    } catch (error) {
      // Getting an access token failed: Google refused the refresh token, or wasn't reachable.
      if (isInvalidGrant(error)) {
        this.markNeedsReconnect(refreshToken);
        return { kind: 'signed-out' };
      }
      return { kind: 'offline' };
    }
  }

  async refreshAccess(): Promise<'ok' | 'offline' | 'signed-out'> {
    const client = this.client;
    const refreshToken = this.account?.refreshToken;
    if (!client || !refreshToken) return 'signed-out';
    // Without an access token the client has to ask Google for a new one.
    client.setCredentials({ refresh_token: refreshToken });
    try {
      await client.getAccessToken();
      return 'ok';
    } catch (error) {
      if (isInvalidGrant(error)) {
        this.markNeedsReconnect(refreshToken);
        return 'signed-out';
      }
      return 'offline';
    }
  }

  rejectSignIn(): void {
    const refreshToken = this.account?.refreshToken;
    if (refreshToken) this.markNeedsReconnect(refreshToken);
  }

  /** At start-up: checks the stored sign-in still works. Being offline is fine; only a refusal counts. */
  async verifyStoredSignIn(): Promise<void> {
    const client = this.client;
    const refreshToken = this.account?.refreshToken;
    if (!client || !refreshToken) return;
    try {
      await client.getAccessToken();
    } catch (error) {
      if (isInvalidGrant(error)) this.markNeedsReconnect(refreshToken);
    }
  }

  /** Development only: one harmless read, the next event in the primary calendar. */
  async testConnection(): Promise<GoogleTestResult> {
    const client = this.client;
    const refreshToken = this.account?.refreshToken;
    if (!client || !refreshToken) return { ok: false, message: 'Not connected.' };
    try {
      const { data } = await client.request<CalendarEventList>({
        url: EVENTS_URL,
        params: {
          maxResults: 1,
          singleEvents: true,
          orderBy: 'startTime',
          timeMin: new Date().toISOString(),
          fields: 'items(summary,start)',
        },
      });
      const next = data.items?.[0];
      if (!next) return { ok: true, message: 'OK. No upcoming events in your primary calendar.' };
      const when = next.start?.dateTime ? new Date(next.start.dateTime).toLocaleString() : next.start?.date;
      return { ok: true, message: `OK. Next event: “${next.summary ?? '(no title)'}”, ${when ?? 'no date'}` };
    } catch (error) {
      if (isInvalidGrant(error)) {
        this.markNeedsReconnect(refreshToken);
        return { ok: false, message: 'Google sign-in expired. Reconnect above.' };
      }
      return { ok: false, message: describeGoogleError(error) };
    }
  }

  /** Runs one sign-in. Returns a notice for Settings, or undefined when it simply worked. */
  private async signIn(client: GoogleClient, attempt: Attempt): Promise<string | undefined> {
    const request = await createAuthRequest(client);
    const loopback = await startLoopback(request.state, this.options.signInTimeoutMs);
    attempt.loopback = loopback;
    if (attempt.cancelled) loopback.cancel();

    const url = client.generateAuthUrl({
      access_type: 'offline',
      // Ask every time, so Google always returns a refresh token (also when reconnecting).
      prompt: 'consent',
      scope: GOOGLE_SCOPES,
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      redirect_uri: loopback.redirectUri,
      login_hint: this.account?.email,
    });
    try {
      await this.options.openExternal(url);
    } catch {
      loopback.cancel();
      return 'Couldn’t open your browser for Google sign-in.';
    }

    const outcome = await loopback.result;
    if (outcome.kind !== 'code') return describeOutcome(outcome);

    this.exchanging = true;
    const { tokens } = await client
      .getToken({ code: outcome.code, codeVerifier: request.codeVerifier, redirect_uri: loopback.redirectUri })
      .finally(() => {
        this.exchanging = false;
      });

    // Google's consent screen lets you untick the calendar permission.
    if (!(tokens.scope ?? '').split(' ').includes(CALENDAR_SCOPE)) {
      const granted = tokens.refresh_token ?? tokens.access_token;
      if (granted) await this.revoke(client, granted);
      return 'AwakeN needs access to your calendar events. Connect again and leave the calendar box ticked.';
    }
    if (!tokens.refresh_token || !tokens.id_token) return 'Google didn’t return a lasting sign-in. Try again.';

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: this.options.config!.clientId });
    const email = ticket.getPayload()?.email;
    if (!email) return 'Google didn’t say which account this is. Try again.';

    this.saveAccount({ email, refreshToken: tokens.refresh_token });
    // The access token stays in memory only.
    client.setCredentials({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
    });
    return undefined;
  }

  /** Google refused this refresh token. Keeps the email so Settings can say which account. */
  private markNeedsReconnect(refreshToken: string): void {
    const account = this.account;
    // Ignore if it was disconnected or reconnected while the request was out.
    if (!account || account.refreshToken !== refreshToken) return;
    this.client?.setCredentials({});
    try {
      this.saveAccount({ email: account.email, refreshToken: null });
    } catch {
      this.options.store.clear();
      this.account = { email: account.email, refreshToken: null };
    }
    this.emit(this.getStatus());
  }

  /** true if Google revoked it or already considered it invalid; false if it couldn't be reached. */
  private async revoke(client: GoogleClient, token: string): Promise<boolean> {
    try {
      await client.revokeToken(token);
      return true;
    } catch (error) {
      return hasResponse(error);
    }
  }

  private saveAccount(account: StoredGoogleAccount): void {
    this.options.store.save(account);
    this.account = account;
  }

  private statusWith(notice: string | undefined): GoogleStatus {
    return notice ? { ...this.getStatus(), notice } : this.getStatus();
  }

  private emit(status: GoogleStatus): GoogleStatus {
    this.options.onStatus?.(status);
    return status;
  }
}

function describeOutcome(outcome: Exclude<SignInOutcome, { kind: 'code' }>): string {
  switch (outcome.kind) {
    case 'denied':
      return 'Google sign-in was cancelled. Nothing was connected.';
    case 'cancelled':
      return 'Sign-in cancelled.';
    case 'timeout':
      return 'Sign-in timed out after 5 minutes. Try again when you’re ready.';
    case 'error':
      return outcome.message;
  }
}

function hasResponse(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'response' in error && Boolean(error.response);
}

/** Google refused the refresh token: revoked, expired (Testing mode: ~7 days), or the password changed. */
export function isInvalidGrant(error: unknown): boolean {
  const { message, response } = (error ?? {}) as { message?: unknown; response?: { data?: { error?: unknown } } };
  return response?.data?.error === 'invalid_grant' || (typeof message === 'string' && message.includes('invalid_grant'));
}

/**
 * A short, safe message for Settings. Never the raw error: a request error carries its request
 * options, headers included, so only Google's own explanation or our wording gets through.
 */
export function describeGoogleError(error: unknown): string {
  if (hasResponse(error)) {
    const { status, data } = (error as { response: { status?: number; data?: unknown } }).response;
    const body = (data ?? {}) as { error?: string | { message?: string }; error_description?: string };
    const detail =
      typeof body.error === 'object' ? body.error.message : (body.error_description ?? body.error);
    return `Google said: ${detail || `HTTP ${status ?? 'error'}`}`;
  }
  if (typeof error === 'object' && error !== null && 'config' in error) {
    return 'Couldn’t reach Google. Check your internet connection.';
  }
  if (error instanceof Error && /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timeout/i.test(error.message)) {
    return 'Couldn’t reach Google. Check your internet connection.';
  }
  // Our own wording is safe to show. Other messages aren't: some library errors include the ID token.
  if (error instanceof SecureStorageError) return error.message;
  return 'Something went wrong talking to Google. Try again.';
}
