-- Phase 3: colour, reminder time and start day for habits.
ALTER TABLE habits ADD COLUMN color TEXT NOT NULL DEFAULT '#4F7A6B';
ALTER TABLE habits ADD COLUMN reminderTime TEXT;
ALTER TABLE habits ADD COLUMN startDate TEXT;

-- Existing habits start on the local day they were created.
UPDATE habits SET startDate = date(createdAt, 'localtime') WHERE startDate IS NULL;

-- One log row per habit per day. Undoing a completion soft-deletes the row and redoing it
-- revives the same row, so the unique index holds. Nothing wrote logs before this migration.
DROP INDEX IF EXISTS idx_habit_logs_habit_date;
CREATE UNIQUE INDEX idx_habit_logs_habit_date ON habit_logs(habitId, date);
