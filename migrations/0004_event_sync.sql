-- Phase 6: pushing events to Google Calendar.
-- syncError: why the last push failed (shown in the app), set only when syncState is 'error'.
-- changeSeq: goes up by one on every local change, so the push queue can tell whether an event
-- changed while its request was out (then it stays 'pending' and goes again).
ALTER TABLE events ADD COLUMN syncError TEXT;
ALTER TABLE events ADD COLUMN changeSeq INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_events_syncState ON events(syncState);
