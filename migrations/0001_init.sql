CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekdays', 'weekly')),
  weekdays TEXT,
  archivedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habitId TEXT NOT NULL REFERENCES habits(id),
  date TEXT NOT NULL,
  completedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habitId, date);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  startAt TEXT NOT NULL,
  endAt TEXT NOT NULL,
  allDay INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'task')),
  completedAt TEXT,
  reminderMinutes TEXT NOT NULL DEFAULT '[]',
  recurrenceRule TEXT,
  googleEventId TEXT,
  googleEtag TEXT,
  syncState TEXT NOT NULL DEFAULT 'local' CHECK (syncState IN ('local', 'synced', 'pending', 'error')),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_startAt ON events(startAt);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
