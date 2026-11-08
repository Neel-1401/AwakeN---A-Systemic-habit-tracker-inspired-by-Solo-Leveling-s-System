# AwakeN (minimal): Claude Code Spec

**How to use**
1. Make an empty folder, open a terminal in it, and run `claude`.
2. Save this file in the folder as `CLAUDE.md` (Claude Code reads it every session).
3. Paste the **Kickoff Prompt** at the bottom. Build one phase at a time and test each before the next.

---

## 1. What we're building

A small, quiet desktop app with just two things:

1. **Habit tracker**: define habits, tick them off each day, see streaks and a simple history.
2. **Calendar**: day/week/month views for events and dated tasks, **synced with Google Calendar** so reminders reach my phone through Google's own notifications.

That's the whole app. No notes, no XP, no ranks, no AI chatbot. Those can come later; do not build ahead.

## 2. Tech stack

- Electron + Vite + React + TypeScript
- SQLite via `better-sqlite3`, accessed only in the main process; renderer uses typed IPC
- `date-fns` for dates; `googleapis` for Google Calendar
- Plain CSS with custom properties (no Tailwind, no component library)
- Vitest for the logic in `/src/core`
- Keep habit, streak, and recurrence logic in `/src/core` with no React or Electron imports, so it can be reused for mobile later

Every table uses UUID primary keys plus `createdAt`, `updatedAt`, and `deletedAt` (soft delete).

## 3. Design: minimal, low colour

- Neutral greys only, plus **one** muted accent used for "done" states and the current day.
- Light theme by default with a dark theme toggle (follow the OS setting).
  - Light: background `#FAFAFA`, surface `#FFFFFF`, border `#E5E5E5`, text `#1A1A1A`, muted `#737373`
  - Dark: background `#111111`, surface `#181818`, border `#2A2A2A`, text `#EDEDED`, muted `#8A8A8A`
  - Accent (both themes): `#4F7A6B` (muted green)
- One typeface: Inter (or the system UI font). No decorative fonts, no gradients, no glows, no shadows, no animations except simple 150 ms fades.
- Flat cards with 1px borders, generous whitespace, small type. It should feel like a quiet notebook.
- Left sidebar with two items: **Habits** and **Calendar**, plus a small Settings link at the bottom.
- Fully keyboard-usable; respect `prefers-reduced-motion`.

## 4. Data model

```
Habit      { id, name, frequency: 'daily' | 'weekdays' | 'weekly', weekdays?: number[], archivedAt? }
HabitLog   { id, habitId, date (YYYY-MM-DD), completedAt }     // one row per habit per day
Event      { id, title, description?, startAt, endAt, allDay, kind: 'event' | 'task',
             completedAt?, reminderMinutes: number[], recurrenceRule?,
             googleEventId?, googleEtag?, syncState: 'local' | 'synced' | 'pending' | 'error' }
Setting    { key, value }          // e.g. google calendar id, sync token, theme
```

Streaks are derived from `HabitLog`, never stored.

## 5. Feature 1: Habit tracker

- Add, rename, archive habits. Each has a name and a frequency (daily, chosen weekdays, or weekly).
- **Today** view: list of habits due today with a single click/tap to complete or undo.
- **Week grid**: habits as rows, the last 7 days as columns, click any cell to toggle (so I can backfill a missed day).
- Streak per habit: consecutive scheduled days completed (weekly habits count weeks). Show current and best streak as plain numbers.
- Missing a day just resets the current streak; it never deletes any history.
- Simple history: a small GitHub-style heatmap per habit (last ~6 months) using shades of the single accent colour.

## 6. Feature 2: Calendar with Google Calendar sync

**Calendar UI**
- Day, week, and month views. Today is highlighted; a "now" line on the day/week views.
- Create, edit, and delete events by clicking a time slot. Fields: title, start, end, all-day, description, reminders, simple repeat (none, daily, weekly, weekdays).
- `kind: 'task'` items are dated to-dos that show on the calendar with a checkbox; completing one marks it done (and updates Google).
- Habits do not appear on the calendar.

**Google sync: start with one-way (app to Google), then add pull**
- Auth: OAuth 2.0 using the **Desktop app** client type, loopback redirect (`http://127.0.0.1:<random port>`), with PKCE. Scope: `https://www.googleapis.com/auth/calendar.events` only.
- Tokens are stored with Electron `safeStorage`, never in the database or source. The client ID/secret come from a local `.env` that is git-ignored, with a `.env.example` committed.
- **Push:** creating, editing, or deleting a local event creates, updates, or deletes the matching Google event. Store `googleEventId` and `etag`. Reminders from `reminderMinutes` are sent as the Google event's `reminders.overrides` (popup), so Google Calendar notifies me on phone and web.
- **Pull:** "Sync now" button plus automatic sync every 10 minutes and on app start, using Google's incremental `syncToken`. Import new or changed events from my primary calendar into local events. If the token expires (410), do a full re-sync.
- **Conflicts:** last write wins by `updated` timestamp. Never silently delete local data; if unsure, mark `syncState: 'error'` and show it.
- **Offline:** work fully offline; queue changes as `syncState: 'pending'` and push when back online.
- Settings shows connection status, the connected Google account, a "Sync now" button, and "Disconnect" (removes tokens; leaves local events in place).
- Reminders always come from Google Calendar. No separate in-app notification system for now.

## 7. Settings (small)
- Google connect/disconnect and sync status
- Theme (system, light, dark), week starts on (Mon/Sun)
- Export all data as JSON; show the database file location

## 8. Non-goals (do not build)
Notes, XP/levels/ranks, AI assistant, accounts or cloud backend, multi-user, mobile app, analytics, plugins, sharing/inviting attendees, multiple Google accounts.

## 9. Build phases (stop and wait for me after each)

1. **Foundation:** scaffold Electron + Vite + React + TS, SQLite schema + migrations, typed IPC, Vitest. Prove a row can be written and read back. Blank window only.
2. **Core logic:** in `/src/core`, habit scheduling ("is this habit due on date X"), streak calculation, recurrence expansion. Unit tests, no UI.
3. **Shell and Habits UI:** theme tokens, sidebar, Today view, week grid, add/archive, streaks, heatmap.
4. **Calendar UI (local only):** day/week/month views, event and task CRUD, recurrence, reminders field.
5. **Google auth:** OAuth loopback + PKCE, token storage, connect/disconnect in Settings, show connected account.
6. **Google push sync:** create/update/delete to Google, reminders as overrides, sync state per event.
7. **Google pull sync:** syncToken incremental sync, 410 handling, conflict rules, offline queue.
8. **Polish:** empty states, error messages, JSON export, keyboard shortcuts, package installers with `electron-builder`.

**Done means, for every phase:** it builds with no TypeScript errors, tests pass, and I can run the app and see the feature work. End each phase with the exact commands to run and what to manually test.

## 10. Working rules
- Don't build ahead of the current phase.
- Ask before adding any dependency not listed above.
- Keep `/src/core` free of Electron and React imports.
- Never hardcode or log secrets or tokens.
- Small, clear commits.

## 11. Decisions
- **No install scripts (`.npmrc`: `ignore-scripts=true`), decided 2026-11-08.** When npm 11
  installs from `package-lock.json` it ignores better-sqlite3's `"gypfile": false` and runs
  `node-gyp rebuild`, which fails on Windows without Visual Studio. Nothing needs it:
  better-sqlite3 13 is a Node-API module with prebuilt binaries that load in both Node (Vitest)
  and Electron (the app), and Electron 45 downloads its own binary on first use. So there's no
  `@electron/rebuild` and Vitest runs under plain Node. `npm run check:native` loads the module
  in both runtimes and should be run after upgrading better-sqlite3 or Electron.
  **Phase 8 caveat:** this also blocks our own `pre*`/`post*` hooks and any dependency install
  hooks. If `electron-builder` needs one (for example `postinstall: electron-builder
  install-app-deps`), run it as an explicit script instead, or revisit this setting.

---

## Google setup I need to do before Phase 5 (guide me through it when we get there)
1. Create a project in Google Cloud Console and enable the **Google Calendar API**.
2. Configure the OAuth consent screen (External, Testing mode) and add my own Google account as a **test user**.
3. Create an OAuth client ID of type **Desktop app** and put the client ID/secret in `.env`.

---

## Kickoff Prompt (paste into Claude Code)

> Read `CLAUDE.md` fully. We're building the minimal AwakeN app following its phases. Start with **Phase 1: Foundation** only. Scaffold Electron + Vite + React + TypeScript, set up `better-sqlite3` with the schema in section 4 (UUID keys, createdAt/updatedAt/deletedAt on every table), a typed IPC layer between main and renderer, and Vitest. Prove it works with a test that writes and reads back one Habit row. No UI beyond a blank window. When done, give me the exact commands to run and test it, then wait for my go-ahead for Phase 2.
