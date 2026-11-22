import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EventInput, SyncStatus } from '../../../shared/ipc';
import { runMigrations } from '../../db/migrate';
import { createEvent, deleteEvent, getEvent, toggleTaskDone, updateEvent } from '../../db/repositories/events';
import { getPushItem, listFailed } from '../../db/repositories/eventSync';
import type { CalendarReply, CalendarRequest, CalendarTransport } from '../calendarApi';
import { EVENTS_URL } from '../calendarApi';
import { googleIdFor } from '../eventMapping';
import { CHANGED_IN_GOOGLE, PushQueue, type Timers } from '../pushQueue';

const NOW = new Date('2026-11-22T10:00:00.000Z');

const lecture: EventInput = {
  title: 'Algorithms lecture',
  description: null,
  kind: 'event',
  allDay: false,
  startAt: '2026-11-23T03:30:00.000Z',
  endAt: '2026-11-23T04:30:00.000Z',
  repeat: null,
  reminderMinutes: [10],
};

const ok = (data: unknown, status = 200): CalendarReply => ({ kind: 'response', status, data });
const status = (code: number, message = 'Nope'): CalendarReply => ({
  kind: 'response',
  status: code,
  data: { error: { code, message } },
});
const OFFLINE: CalendarReply = { kind: 'offline' };

/**
 * A fake HTTP layer: answers each request with the next scripted reply (or a function of the
 * request) and records what was sent, so tests can check the method, URL, body and headers.
 */
interface FakeTransport extends CalendarTransport {
  sent: CalendarRequest[];
  replies: (CalendarReply | ((request: CalendarRequest) => CalendarReply))[];
  refreshes: ('ok' | 'offline' | 'signed-out')[];
  refreshCalls: number;
  rejected: boolean;
}

function fakeTransport(): FakeTransport {
  const fake: FakeTransport = {
    sent: [] as CalendarRequest[],
    replies: [] as (CalendarReply | ((request: CalendarRequest) => CalendarReply))[],
    refreshes: [] as ('ok' | 'offline' | 'signed-out')[],
    refreshCalls: 0,
    rejected: false,
    async send(request: CalendarRequest): Promise<CalendarReply> {
      fake.sent.push(structuredClone(request));
      const next = fake.replies.shift();
      if (!next) throw new Error(`Unexpected request: ${request.method} ${request.url}`);
      return typeof next === 'function' ? next(request) : next;
    },
    async refreshAccess() {
      fake.refreshCalls += 1;
      return fake.refreshes.shift() ?? 'ok';
    },
    rejectSignIn() {
      fake.rejected = true;
    },
  };
  return fake;
}

/** Timers that never fire on their own; tests read the delays that were asked for. */
function fakeTimers() {
  const delays: number[] = [];
  const timers: Timers = {
    set: (_callback, ms) => delays.push(ms),
    clear: () => {},
  };
  return { timers, delays };
}

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, path.resolve(__dirname, '../../../../migrations'));
});

function setup(options: { connection?: SyncStatus['connection']; online?: boolean } = {}) {
  const transport = fakeTransport();
  const { timers, delays } = fakeTimers();
  const statuses: SyncStatus[] = [];
  const state = { connection: options.connection ?? 'on', online: options.online ?? true, now: NOW };
  const queue = new PushQueue({
    db,
    transport,
    connection: () => state.connection,
    isOnline: () => state.online,
    onStatus: (s) => statuses.push(s),
    now: () => state.now,
    timers,
  });
  return { queue, transport, delays, statuses, state };
}

/** A new event saved while Google is connected ('pending'). */
const addPending = (input = lecture) => createEvent(db, input, NOW, true);

/** An event Google already has, with ID g1 and etag "e1". */
function addSynced() {
  const event = addPending();
  db.prepare(`UPDATE events SET syncState = 'synced', googleEventId = 'g1', googleEtag = '"e1"' WHERE id = ?`).run(
    event.id,
  );
  return getEvent(db, event.id);
}

const stored = (id: string) => getPushItem(db, id)!.event;

describe('PushQueue', () => {
  it('new event: inserted into the primary calendar, then synced with Google’s ID and etag', async () => {
    const { queue, transport } = setup();
    const event = addPending();
    expect(event.syncState).toBe('pending');
    transport.replies.push(ok({ id: googleIdFor(event.id), etag: '"e1"' }));

    await queue.run();

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ method: 'POST', url: EVENTS_URL, data: { summary: 'Algorithms lecture' } });
    expect(stored(event.id)).toMatchObject({ syncState: 'synced', googleEventId: googleIdFor(event.id), googleEtag: '"e1"' });
    expect(queue.getStatus()).toMatchObject({ pending: 0, failed: 0, lastSyncedAt: NOW.toISOString(), offline: false });
  });

  it('edit: patched with If-Match, and the new etag is kept', async () => {
    const { queue, transport } = setup();
    const event = addSynced();
    updateEvent(db, event.id, { ...lecture, title: 'Algorithms (moved)' }, NOW, true);
    expect(stored(event.id).syncState).toBe('pending');
    transport.replies.push(ok({ id: 'g1', etag: '"e2"' }));

    await queue.run();

    expect(transport.sent[0]).toMatchObject({
      method: 'PATCH',
      url: `${EVENTS_URL}/g1`,
      headers: { 'If-Match': '"e1"' },
      data: { summary: 'Algorithms (moved)' },
    });
    expect(stored(event.id)).toMatchObject({ syncState: 'synced', googleEtag: '"e2"' });
  });

  it('delete: removed in Google with If-Match; the local row stays, deleted, until then', async () => {
    const { queue, transport } = setup();
    const event = addSynced();
    deleteEvent(db, event.id, NOW, true);
    expect(stored(event.id)).toMatchObject({ syncState: 'pending', deletedAt: NOW.toISOString() });
    transport.replies.push(ok('', 204));

    await queue.run();

    expect(transport.sent[0]).toMatchObject({ method: 'DELETE', url: `${EVENTS_URL}/g1`, headers: { 'If-Match': '"e1"' } });
    expect(stored(event.id)).toMatchObject({ syncState: 'synced', deletedAt: NOW.toISOString() });
  });

  it('delete of something Google already removed (410) counts as done', async () => {
    const { queue, transport } = setup();
    const event = addSynced();
    deleteEvent(db, event.id, NOW, true);
    transport.replies.push(status(410, 'Resource has been deleted'));
    await queue.run();
    expect(stored(event.id).syncState).toBe('synced');
  });

  it('offline: nothing is sent, changes stay pending and a retry is scheduled', async () => {
    const { queue, transport, delays, state } = setup({ online: false });
    const event = addPending();

    await queue.run();
    expect(transport.sent).toHaveLength(0);
    expect(stored(event.id).syncState).toBe('pending');
    expect(queue.getStatus()).toMatchObject({ pending: 1, offline: true, lastSyncedAt: null });
    expect(delays.at(-1)).toBe(15_000);

    // Back online: the waiting change goes up.
    state.online = true;
    transport.replies.push(ok({ id: 'g1', etag: '"e1"' }));
    await queue.run();
    expect(stored(event.id).syncState).toBe('synced');
    expect(queue.getStatus().offline).toBe(false);
  });

  it('network failure mid-pass: stays pending and backs off further each time', async () => {
    const { queue, transport, delays } = setup();
    const event = addPending();
    transport.replies.push(OFFLINE, OFFLINE, OFFLINE);

    await queue.run();
    await queue.run();
    await queue.run();

    expect(stored(event.id)).toMatchObject({ syncState: 'pending', syncError: null });
    expect(delays).toEqual([15_000, 30_000, 60_000]);
  });

  it('5xx: stays pending and that event waits before it’s tried again', async () => {
    const { queue, transport, delays, state } = setup();
    const event = addPending();
    transport.replies.push(status(503, 'Backend Error'));

    await queue.run();
    expect(stored(event.id)).toMatchObject({ syncState: 'pending', syncError: null });
    expect(delays.at(-1)).toBe(30_000);

    // Too early: not sent again.
    await queue.run();
    expect(transport.sent).toHaveLength(1);

    state.now = new Date(NOW.getTime() + 30_000);
    transport.replies.push(ok({ id: 'g1', etag: '"e1"' }));
    await queue.run();
    expect(stored(event.id).syncState).toBe('synced');
  });

  it('412 on update: marked error and not overwritten', async () => {
    const { queue, transport } = setup();
    const event = addSynced();
    updateEvent(db, event.id, { ...lecture, title: 'Mine' }, NOW, true);
    transport.replies.push(status(412, 'Precondition Failed'));

    await queue.run();

    expect(transport.sent).toHaveLength(1);
    expect(stored(event.id)).toMatchObject({ syncState: 'error', syncError: CHANGED_IN_GOOGLE, googleEtag: '"e1"' });
    expect(queue.getStatus()).toMatchObject({ pending: 0, failed: 1 });
    expect(listFailed(db)).toEqual([
      expect.objectContaining({ id: event.id, title: 'Mine', deleted: false, error: CHANGED_IN_GOOGLE }),
    ]);
  });

  it('412 on delete: marked error, the local row stays deleted', async () => {
    const { queue, transport } = setup();
    const event = addSynced();
    deleteEvent(db, event.id, NOW, true);
    transport.replies.push(status(412));
    await queue.run();
    expect(stored(event.id)).toMatchObject({ syncState: 'error', deletedAt: NOW.toISOString() });
    expect(listFailed(db)[0]).toMatchObject({ deleted: true });
  });

  it('401: refreshes the token once and sends again', async () => {
    const { queue, transport } = setup();
    const event = addPending();
    transport.replies.push(status(401, 'Invalid Credentials'), ok({ id: 'g1', etag: '"e1"' }));

    await queue.run();

    expect(transport.refreshCalls).toBe(1);
    expect(transport.sent).toHaveLength(2);
    expect(stored(event.id).syncState).toBe('synced');
    expect(transport.rejected).toBe(false);
  });

  it('401 again after the refresh: needs reconnect, and the change keeps waiting', async () => {
    const { queue, transport } = setup();
    const event = addPending();
    transport.replies.push(status(401), status(401));

    await queue.run();

    expect(transport.refreshCalls).toBe(1);
    expect(transport.rejected).toBe(true);
    expect(stored(event.id)).toMatchObject({ syncState: 'pending', syncError: null });
  });

  it('401 and Google refuses the refresh: stops without marking anything failed', async () => {
    const { queue, transport } = setup();
    addPending();
    addPending({ ...lecture, title: 'Second' });
    transport.replies.push(status(401));
    transport.refreshes.push('signed-out');

    await queue.run();

    expect(transport.sent).toHaveLength(1);
    expect(queue.getStatus()).toMatchObject({ pending: 2, failed: 0 });
  });

  it('other 4xx: marked error with Google’s message, and the rest still go', async () => {
    const { queue, transport } = setup();
    const bad = addPending();
    const good = addPending({ ...lecture, title: 'Second' });
    const answer = (request: CalendarRequest) =>
      (request.data as { summary: string }).summary === 'Second'
        ? ok({ id: 'g2', etag: '"e1"' })
        : status(400, 'Invalid start time.');
    transport.replies.push(answer, answer);

    await queue.run();

    expect(stored(bad.id)).toMatchObject({ syncState: 'error', syncError: 'Google said: Invalid start time.' });
    expect(stored(good.id).syncState).toBe('synced');
  });

  it('retry: a failed event goes back in the queue and syncs', async () => {
    const { queue, transport } = setup();
    const event = addPending();
    transport.replies.push(status(400, 'Invalid start time.'));
    await queue.run();
    expect(stored(event.id).syncState).toBe('error');

    transport.replies.push(ok({ id: 'g1', etag: '"e1"' }));
    queue.retry(event.id);
    await queue.run();
    expect(stored(event.id)).toMatchObject({ syncState: 'synced', syncError: null });
  });

  it('an edit while the insert is out: the ID is kept and it stays pending for a patch', async () => {
    const { queue, transport } = setup();
    const event = addPending();
    transport.replies.push(() => {
      updateEvent(db, event.id, { ...lecture, title: 'Edited meanwhile' }, NOW, true);
      return ok({ id: 'g1', etag: '"e1"' });
    });
    transport.replies.push(ok({ id: 'g1', etag: '"e2"' }));

    queue.kick(); // what main does after the edit: another pass follows
    await queue.run();

    expect(transport.sent.map((r) => r.method)).toEqual(['POST']);
    expect(stored(event.id)).toMatchObject({ syncState: 'pending', googleEventId: 'g1' });
    await queue.run();
    expect(transport.sent[1]).toMatchObject({ method: 'PATCH', data: { summary: 'Edited meanwhile' } });
    expect(stored(event.id).syncState).toBe('synced');
  });

  it('409 on insert (an earlier insert got through): takes over that event and patches it', async () => {
    const { queue, transport } = setup();
    const event = addPending();
    const id = googleIdFor(event.id);
    transport.replies.push(status(409, 'The requested identifier already exists.'));
    transport.replies.push(ok({ id, etag: '"e1"', status: 'confirmed' }));
    transport.replies.push(ok({ id, etag: '"e2"' }));

    await queue.run();

    expect(transport.sent.map((r) => r.method)).toEqual(['POST', 'GET', 'PATCH']);
    expect(transport.sent[2].headers).toEqual({ 'If-Match': '"e1"' });
    expect(stored(event.id)).toMatchObject({ syncState: 'synced', googleEventId: id, googleEtag: '"e2"' });
  });

  it('not connected: nothing is sent and new events stay local', async () => {
    const { queue, transport } = setup({ connection: 'off' });
    const event = createEvent(db, lecture, NOW, false);
    await queue.run();
    expect(transport.sent).toHaveLength(0);
    expect(stored(event.id).syncState).toBe('local');
    expect(queue.getStatus()).toMatchObject({ connection: 'off', pending: 0, localOnly: 1 });
  });

  it('upload offer: counts local-only events and queues them on Upload', async () => {
    const { queue, transport } = setup();
    createEvent(db, lecture, NOW, false);
    createEvent(db, { ...lecture, title: 'Second' }, NOW, false);

    queue.offerUpload();
    expect(queue.getStatus().uploadOffer).toBe(2);

    queue.answerUpload(true);
    expect(queue.getStatus()).toMatchObject({ uploadOffer: null, pending: 2, localOnly: 0 });
    transport.replies.push(ok({ id: 'g1', etag: '"e"' }), ok({ id: 'g2', etag: '"e"' }));
    await queue.run();
    expect(queue.getStatus()).toMatchObject({ pending: 0, failed: 0 });
  });

  it('upload offer: Not now leaves them local', () => {
    const { queue } = setup();
    createEvent(db, lecture, NOW, false);
    queue.offerUpload();
    queue.answerUpload(false);
    expect(queue.getStatus()).toMatchObject({ uploadOffer: null, pending: 0, localOnly: 1 });
  });

  it('completing a task only changes it locally (for now)', () => {
    const { queue } = setup();
    const task = addSynced();
    db.prepare(`UPDATE events SET kind = 'task' WHERE id = ?`).run(task.id);
    expect(toggleTaskDone(db, task.id, undefined, NOW)).toBe(true);
    expect(stored(task.id).syncState).toBe('synced');
    expect(queue.getStatus().pending).toBe(0);
  });
});
