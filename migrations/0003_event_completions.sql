-- Phase 4: completion of a repeating task, one row per occurrence day.
-- A one-off task keeps using events.completedAt. Undo soft-deletes the row and doing it again
-- revives the same row, so the unique index holds (the same pattern as habit_logs).
CREATE TABLE IF NOT EXISTS event_completions (
  id TEXT PRIMARY KEY,
  eventId TEXT NOT NULL REFERENCES events(id),
  day TEXT NOT NULL,
  completedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_completions_event_day ON event_completions(eventId, day);
