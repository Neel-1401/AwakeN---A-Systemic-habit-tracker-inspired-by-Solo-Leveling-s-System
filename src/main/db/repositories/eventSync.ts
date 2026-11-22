import type Database from 'better-sqlite3';
import type { CalendarEvent } from '../../../core/types';
import type { FailedSyncItem } from '../../../shared/ipc';
import { rowToEvent, type EventRow } from './events';
import { getSetting, setSetting } from './settings';

/**
 * The push queue's view of the events table. None of these touch updatedAt: that's the time of
 * the last change *you* made, which Phase 7 compares with Google's.
 *
 * Every result is written with the changeSeq the request was built from. If the event changed
 * while the request was out, the result no longer describes it, so it stays 'pending' and the
 * newer version is sent next (Google's ID and etag are still kept).
 */

export interface PushItem {
  /** Deleted events included (deletedAt set): their delete still has to reach Google. */
  event: CalendarEvent;
  changeSeq: number;
}

const LAST_SYNC_KEY = 'googleLastSyncAt';

export function listPending(db: Database.Database): PushItem[] {
  return (
    db.prepare(`SELECT * FROM events WHERE syncState = 'pending' ORDER BY updatedAt, id`).all() as EventRow[]
  ).map((row) => ({ event: rowToEvent(row), changeSeq: row.changeSeq }));
}

export function getPushItem(db: Database.Database, id: string): PushItem | null {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
  return row ? { event: rowToEvent(row), changeSeq: row.changeSeq } : null;
}

/** Google has this version: remember its ID and etag. */
export function markPushed(
  db: Database.Database,
  id: string,
  changeSeq: number,
  google: { googleEventId: string; googleEtag: string },
): void {
  db.prepare(
    `UPDATE events
     SET googleEventId = @googleEventId, googleEtag = @googleEtag, syncError = NULL,
         syncState = CASE WHEN changeSeq = @changeSeq THEN 'synced' ELSE 'pending' END
     WHERE id = @id AND syncState = 'pending'`,
  ).run({ id, changeSeq, ...google });
}

/**
 * The event already exists in Google under our ID (an earlier insert got there but its reply
 * didn't get back). Takes over its ID and etag and stays 'pending', so it's patched next.
 */
export function adoptGoogleEvent(
  db: Database.Database,
  id: string,
  google: { googleEventId: string; googleEtag: string },
): void {
  db.prepare(
    `UPDATE events SET googleEventId = @googleEventId, googleEtag = @googleEtag
     WHERE id = @id AND syncState = 'pending'`,
  ).run({ id, ...google });
}

/** A deleted event that never reached Google: nothing to do there. */
export function markLocalOnly(db: Database.Database, id: string, changeSeq: number): void {
  db.prepare(
    `UPDATE events SET syncState = 'local', syncError = NULL
     WHERE id = ? AND changeSeq = ? AND syncState = 'pending'`,
  ).run(id, changeSeq);
}

/** Google refused this version. Shown with a warning icon until a retry or a new edit. */
export function markFailed(db: Database.Database, id: string, changeSeq: number, message: string): void {
  db.prepare(
    `UPDATE events
     SET syncState = CASE WHEN changeSeq = @changeSeq THEN 'error' ELSE 'pending' END,
         syncError = CASE WHEN changeSeq = @changeSeq THEN @message ELSE NULL END
     WHERE id = @id AND syncState = 'pending'`,
  ).run({ id, changeSeq, message });
}

/** pending includes deletes waiting to reach Google; failed includes deletes Google refused. */
export function countSyncStates(db: Database.Database): { pending: number; failed: number } {
  const rows = db
    .prepare(
      `SELECT syncState, COUNT(*) AS n FROM events WHERE syncState IN ('pending', 'error') GROUP BY syncState`,
    )
    .all() as { syncState: 'pending' | 'error'; n: number }[];
  return {
    pending: rows.find((r) => r.syncState === 'pending')?.n ?? 0,
    failed: rows.find((r) => r.syncState === 'error')?.n ?? 0,
  };
}

/** Events that exist only in AwakeN (made while Google wasn't connected). */
export function countLocalOnly(db: Database.Database): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM events
         WHERE deletedAt IS NULL AND syncState = 'local' AND googleEventId IS NULL`,
      )
      .get() as { n: number }
  ).n;
}

/** Queues every local-only event for upload. Returns how many. */
export function queueLocalOnly(db: Database.Database): number {
  return db
    .prepare(
      `UPDATE events SET syncState = 'pending', syncError = NULL, changeSeq = changeSeq + 1
       WHERE deletedAt IS NULL AND syncState = 'local' AND googleEventId IS NULL`,
    )
    .run().changes;
}

export function listFailed(db: Database.Database): FailedSyncItem[] {
  return (
    db
      .prepare(
        `SELECT id, title, startAt, allDay, deletedAt, syncError FROM events
         WHERE syncState = 'error' ORDER BY startAt, id`,
      )
      .all() as Pick<EventRow, 'id' | 'title' | 'startAt' | 'allDay' | 'deletedAt' | 'syncError'>[]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    startAt: row.startAt,
    allDay: row.allDay === 1,
    deleted: row.deletedAt !== null,
    error: row.syncError ?? 'Couldn’t sync with Google Calendar.',
  }));
}

/** Puts a failed event back in the queue. false if it wasn't failed (already retried, say). */
export function retryFailed(db: Database.Database, id: string): boolean {
  return (
    db
      .prepare(`UPDATE events SET syncState = 'pending', syncError = NULL WHERE id = ? AND syncState = 'error'`)
      .run(id).changes > 0
  );
}

export function getLastSyncAt(db: Database.Database): string | null {
  return getSetting(db, LAST_SYNC_KEY);
}

export function setLastSyncAt(db: Database.Database, at: Date): void {
  setSetting(db, LAST_SYNC_KEY, at.toISOString(), at);
}
