import type Database from 'better-sqlite3';
import type { SyncStatus } from '../../shared/ipc';
import {
  adoptGoogleEvent,
  countLocalOnly,
  countSyncStates,
  getLastSyncAt,
  getPushItem,
  listPending,
  markFailed,
  markLocalOnly,
  markPushed,
  queueLocalOnly,
  retryFailed,
  setLastSyncAt,
  type PushItem,
} from '../db/repositories/eventSync';
import {
  EVENTS_URL,
  eventUrl,
  googleErrorMessage,
  googleErrorReason,
  type CalendarReply,
  type CalendarRequest,
  type CalendarTransport,
} from './calendarApi';
import { GOOGLE_TIME_ZONE, googleIdFor, toGoogleInsert, toGooglePatch, type GoogleEventResource } from './eventMapping';

/** A pass runs this often even when nothing happened, to pick up anything that's waiting. */
export const PUSH_EVERY_MS = 2 * 60_000;
/** After a change, wait this long so a quick series of edits goes as one pass. */
const KICK_DELAY_MS = 300;
/** No network: try again after 15 s, 30 s, 1 min, then every 2 min. */
const OFFLINE_RETRY_MS = [15_000, 30_000, 60_000, 120_000];
/** Google had a problem with one event (5xx, rate limit): 30 s, doubling, at most 30 min. */
const SERVER_RETRY_FIRST_MS = 30_000;
const SERVER_RETRY_MAX_MS = 30 * 60_000;
const MAX_ERROR_LENGTH = 300;
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

export const CHANGED_IN_GOOGLE =
  'Changed in Google Calendar since AwakeN last synced it, so AwakeN didn’t overwrite it.';
export const MISSING_IN_GOOGLE = 'Not found in Google Calendar. It may have been deleted there.';
const DELETED_IN_GOOGLE = 'Deleted in Google Calendar, so AwakeN didn’t put it back.';
const DELETE_CHANGED_IN_GOOGLE =
  'Changed in Google Calendar since AwakeN last synced it, so AwakeN didn’t delete it there.';

/** How one event's push went. 'later': Google had a temporary problem with it. */
type Outcome = 'done' | 'later' | 'offline' | 'signed-out';

export interface Timers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PushQueueOptions {
  db: Database.Database;
  transport: CalendarTransport;
  /** 'on' only when Google is connected; nothing is sent otherwise. */
  connection(): SyncStatus['connection'];
  /** Electron's net.isOnline(). When false, a pass doesn't even try. */
  isOnline(): boolean;
  /** Called whenever the status or an event's sync state may have changed. */
  onStatus?(status: SyncStatus): void;
  now?(): Date;
  timeZone?: string;
  timers?: Timers;
}

/**
 * Sends local changes ('pending' events) to Google Calendar, one at a time, oldest first.
 * Runs right after a change (kick), at start-up and every 2 minutes (start), and on a retry
 * timer after a failure. Push only: nothing is read back from Google here (that's Phase 7).
 *
 * The database is the queue: an event is 'pending' until Google has its latest version. So the
 * queue survives restarts, and only the retry timing (backoff) is kept in memory.
 *
 * Nothing here logs event contents or tokens.
 */
export class PushQueue {
  private running: Promise<void> | null = null;
  private runAgain = false;
  private offline = false;
  private offlineFailures = 0;
  /** Per event: how often Google failed temporarily, and when to try again (ms). */
  private readonly serverRetry = new Map<string, { failures: number; at: number }>();
  private retryTimer: unknown = null;
  private kickTimer: unknown = null;
  private periodTimer: unknown = null;
  private stopped = false;
  private uploadOffer: number | null = null;

  constructor(private readonly options: PushQueueOptions) {}

  private get db() {
    return this.options.db;
  }

  private get timers() {
    return this.options.timers ?? realTimers;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Runs a pass now, then every 2 minutes. */
  start(): void {
    this.stopped = false;
    const tick = () => {
      if (this.stopped) return;
      void this.run();
      this.periodTimer = this.timers.set(tick, PUSH_EVERY_MS);
    };
    tick();
  }

  stop(): void {
    this.stopped = true;
    for (const timer of [this.periodTimer, this.retryTimer, this.kickTimer]) {
      if (timer !== null) this.timers.clear(timer);
    }
    this.periodTimer = this.retryTimer = this.kickTimer = null;
  }

  /** A local change was saved: push soon. */
  kick(): void {
    this.emit();
    if (this.kickTimer !== null) this.timers.clear(this.kickTimer);
    this.kickTimer = this.timers.set(() => {
      this.kickTimer = null;
      void this.run();
    }, KICK_DELAY_MS);
  }

  /** One pass over everything pending. If one is already running, another follows it. */
  run(): Promise<void> {
    if (this.running) {
      this.runAgain = true;
      return this.running;
    }
    const running = (async () => {
      try {
        do {
          this.runAgain = false;
          await this.pass();
        } while (this.runAgain);
      } catch (error) {
        // A database error, say. The next pass may work; never log what the event contained.
        console.error('Push sync failed:', error instanceof Error ? error.name : 'unknown error');
      } finally {
        this.running = null;
        this.emit();
      }
    })();
    this.running = running;
    return running;
  }

  getStatus(): SyncStatus {
    const connection = this.options.connection();
    return {
      connection,
      ...countSyncStates(this.db),
      lastSyncedAt: getLastSyncAt(this.db),
      offline: connection === 'on' && this.offline,
      uploadOffer: connection === 'off' ? null : this.uploadOffer,
      localOnly: countLocalOnly(this.db),
    };
  }

  /** Google was connected or disconnected, or its sign-in expired or came back. */
  connectionChanged(): void {
    if (this.options.connection() === 'on') {
      this.kick();
    } else {
      if (this.options.connection() === 'off') this.uploadOffer = null;
      this.emit();
    }
  }

  /** Just connected: ask once whether to upload the events that are only in AwakeN. */
  offerUpload(): void {
    const count = countLocalOnly(this.db);
    this.uploadOffer = count > 0 ? count : null;
    this.emit();
  }

  answerUpload(upload: boolean): void {
    this.uploadOffer = null;
    if (upload) queueLocalOnly(this.db);
    this.kick();
  }

  /** Settings: upload every local-only event now. */
  uploadLocal(): number {
    const count = queueLocalOnly(this.db);
    this.uploadOffer = null;
    this.kick();
    return count;
  }

  /** "Retry" on a failed event: back in the queue, tried straight away. */
  retry(id: string): void {
    retryFailed(this.db, id);
    this.serverRetry.delete(id);
    this.emit();
    void this.run();
  }

  private emit(): void {
    this.options.onStatus?.(this.getStatus());
  }

  private async pass(): Promise<void> {
    if (this.options.connection() !== 'on') return;
    if (!this.options.isOnline()) {
      this.wentOffline();
      return;
    }

    let deferred = false;
    for (const { event } of listPending(this.db)) {
      const wait = this.serverRetry.get(event.id);
      if (wait && wait.at > this.now().getTime()) {
        deferred = true;
        continue;
      }
      // Read again: it may have changed (or been retried) while earlier ones were sent.
      const item = getPushItem(this.db, event.id);
      if (!item || item.event.syncState !== 'pending') continue;

      const outcome = await this.pushOne(item);
      if (outcome === 'offline') {
        this.wentOffline();
        return;
      }
      if (outcome === 'signed-out') return;
      if (outcome === 'later') {
        deferred = true;
        const failures = (wait?.failures ?? 0) + 1;
        const delay = Math.min(SERVER_RETRY_FIRST_MS * 2 ** (failures - 1), SERVER_RETRY_MAX_MS);
        this.serverRetry.set(event.id, { failures, at: this.now().getTime() + delay });
      } else {
        this.serverRetry.delete(event.id);
      }
      this.emit();
    }

    this.offline = false;
    this.offlineFailures = 0;
    if (deferred) {
      const next = Math.min(...[...this.serverRetry.values()].map((r) => r.at));
      this.retryAfter(Math.max(0, next - this.now().getTime()));
    } else {
      setLastSyncAt(this.db, this.now());
    }
  }

  private wentOffline(): void {
    this.offline = true;
    this.offlineFailures += 1;
    this.retryAfter(OFFLINE_RETRY_MS[Math.min(this.offlineFailures, OFFLINE_RETRY_MS.length) - 1]);
  }

  private retryAfter(ms: number): void {
    if (this.stopped) return;
    if (this.retryTimer !== null) this.timers.clear(this.retryTimer);
    this.retryTimer = this.timers.set(() => {
      this.retryTimer = null;
      void this.run();
    }, ms);
  }

  private pushOne(item: PushItem): Promise<Outcome> {
    if (item.event.deletedAt) return this.pushDelete(item);
    if (!item.event.googleEventId) return this.pushInsert(item);
    return this.pushPatch(item);
  }

  private async pushInsert(item: PushItem): Promise<Outcome> {
    const body = toGoogleInsert(item.event, this.timeZone);
    const reply = await this.request({ method: 'POST', url: EVENTS_URL, data: body });
    if (reply.kind !== 'response') return reply.kind;
    if (isOk(reply.status)) return this.saved(item, reply.data);
    // Our ID is taken: most likely our own earlier insert, whose reply never arrived.
    if (reply.status === 409) return this.adoptExisting(item, body.id!);
    return this.failed(item, reply);
  }

  private async adoptExisting(item: PushItem, googleEventId: string): Promise<Outcome> {
    const reply = await this.request({ method: 'GET', url: eventUrl(googleEventId) });
    if (reply.kind !== 'response') return reply.kind;
    const existing = reply.data as Partial<GoogleEventResource> | null;
    if (isOk(reply.status) && existing?.status !== 'cancelled' && existing?.id && existing.etag) {
      adoptGoogleEvent(this.db, item.event.id, { googleEventId: existing.id, googleEtag: existing.etag });
      const adopted = getPushItem(this.db, item.event.id);
      // Now patch it, so Google gets this version (the stored etag guards it like any update).
      return adopted?.event.syncState === 'pending' ? this.pushPatch(adopted) : 'done';
    }
    if (isOk(reply.status) || reply.status === 404 || reply.status === 410) {
      markFailed(this.db, item.event.id, item.changeSeq, DELETED_IN_GOOGLE);
      return 'done';
    }
    return this.failed(item, reply);
  }

  private async pushPatch(item: PushItem): Promise<Outcome> {
    const { event } = item;
    const reply = await this.request({
      method: 'PATCH',
      url: eventUrl(event.googleEventId!),
      data: toGooglePatch(event, this.timeZone),
      headers: ifMatch(event.googleEtag),
    });
    if (reply.kind !== 'response') return reply.kind;
    if (isOk(reply.status)) return this.saved(item, reply.data);
    if (reply.status === 412) return this.markFailed(item, CHANGED_IN_GOOGLE);
    if (reply.status === 404 || reply.status === 410) return this.markFailed(item, MISSING_IN_GOOGLE);
    return this.failed(item, reply);
  }

  private async pushDelete(item: PushItem): Promise<Outcome> {
    const { event } = item;
    // No stored ID: an insert may still have reached Google under our ID, so delete that.
    const googleEventId = event.googleEventId ?? googleIdFor(event.id);
    const reply = await this.request({
      method: 'DELETE',
      url: eventUrl(googleEventId),
      headers: event.googleEventId ? ifMatch(event.googleEtag) : undefined,
    });
    if (reply.kind !== 'response') return reply.kind;
    // 404/410: already gone from Google, which is what we wanted.
    if (isOk(reply.status) || reply.status === 404 || reply.status === 410) {
      if (event.googleEventId) {
        markPushed(this.db, event.id, item.changeSeq, { googleEventId, googleEtag: event.googleEtag ?? '' });
      } else {
        markLocalOnly(this.db, event.id, item.changeSeq);
      }
      return 'done';
    }
    if (reply.status === 412) return this.markFailed(item, DELETE_CHANGED_IN_GOOGLE);
    return this.failed(item, reply);
  }

  /** A 2xx with the event: store its ID and etag. */
  private saved(item: PushItem, data: unknown): Outcome {
    const resource = data as Partial<GoogleEventResource> | null;
    const googleEventId = resource?.id ?? item.event.googleEventId;
    if (!googleEventId || !resource?.etag) {
      return this.markFailed(item, 'Google’s reply was missing the event’s ID or version.');
    }
    markPushed(this.db, item.event.id, item.changeSeq, { googleEventId, googleEtag: resource.etag });
    return 'done';
  }

  /** Any other status: temporary problems wait and retry, the rest are shown as failed. */
  private failed(item: PushItem, reply: Extract<CalendarReply, { kind: 'response' }>): Outcome {
    const { status, data } = reply;
    const rateLimited = status === 429 || (status === 403 && RATE_LIMIT_REASONS.has(googleErrorReason(data) ?? ''));
    if (status >= 500 || rateLimited) return 'later';
    return this.markFailed(item, `Google said: ${googleErrorMessage(data) ?? `HTTP ${status}`}`);
  }

  private markFailed(item: PushItem, message: string): Outcome {
    markFailed(this.db, item.event.id, item.changeSeq, message.slice(0, MAX_ERROR_LENGTH));
    return 'done';
  }

  /**
   * Sends one request. On 401 the access token is refreshed once and the request sent again;
   * a second 401 means the sign-in no longer works, so Settings asks to reconnect.
   */
  private async request(request: CalendarRequest): Promise<CalendarReply> {
    const { transport } = this.options;
    const reply = await transport.send(request);
    if (reply.kind !== 'response' || reply.status !== 401) return reply;

    const refreshed = await transport.refreshAccess();
    if (refreshed !== 'ok') return { kind: refreshed };
    const again = await transport.send(request);
    if (again.kind === 'response' && again.status === 401) {
      transport.rejectSignIn();
      return { kind: 'signed-out' };
    }
    return again;
  }

  private get timeZone() {
    return this.options.timeZone ?? GOOGLE_TIME_ZONE;
  }
}

const isOk = (status: number) => status >= 200 && status < 300;

/** Only change it in Google if it's still the version we last saw there. */
const ifMatch = (etag: string | null | undefined) => (etag ? { 'If-Match': etag } : undefined);
