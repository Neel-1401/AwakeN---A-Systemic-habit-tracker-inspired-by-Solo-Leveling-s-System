# AwakeN

A habit tracker and calendar for my desktop.

The idea started with the System from Solo Leveling: daily quests, streaks, something that keeps
you honest. This first version leaves out the levels and ranks. Right now I just want something
plain that I'll actually open every day:

- **Habits**: tick them off, keep a streak going, look back over the year. A habit can have a
  reminder time, and the app shows a desktop notification if it isn't done yet.
- **Calendar**: events and dated to-dos that sync with Google Calendar, so event reminders reach
  my phone through Google's own notifications.

Everything is stored locally in SQLite. There's no account and no server.

## Where it's at

Early. I'm building it in phases. The first six are done; pulling changes back from Google Calendar is next.

- [x] **1. Foundation**: Electron + React + TypeScript, the SQLite schema, and IPC between the
      window and the database
- [x] **2. Core logic**: when habits are due, streaks, repeating events
- [x] **3. Habits screen**, in four steps:
  - [x] 3a. Database and IPC: habit colour, reminder time and start day; completing, undoing
        and backfilling days; every request checked in the main process
  - [x] 3b. App layout and the Today view, the New/Edit habit dialog, theme settings
  - [x] 3c. Month and Year views: a habit × day grid with monthly rates, and a heatmap for
        all habits plus one per habit
  - [x] 3d. Habit reminders as desktop notifications, once per habit per day, while the app
        is open
- [x] **4. Calendar (local only)**, in three steps:
  - [x] 4a. Database and IPC for events and tasks, repeats stored as Google-style RRULE text,
        per-day ticks for repeating tasks
  - [x] 4b. Week and Day views and the event dialog
  - [x] 4c. Month view, keyboard shortcuts, sample data for development, empty state
- [x] **5. Google sign-in**: connect and disconnect in Settings, the sign-in kept encrypted on
      this computer, a clear "sign-in expired" state with Reconnect. No events are synced yet.
- [x] **6. Push events to Google Calendar**: new, changed and deleted events and tasks go to my
      primary calendar with their reminders; works offline and catches up later
- [ ] 7. Pull changes back from Google
- [ ] 8. Polish and installers

If you run it now, the Habits page has three tabs:

- **Today**: tick habits off, backfill the last 7 days, see current and best streaks.
- **Month**: every habit against every day of the month; click a past day to toggle it.
- **Year**: a heatmap for all habits together and one per habit, with % done, days done and
  best streak.

The **Calendar** page has Day, Week and Month views. Click an empty slot (or the all-day row) to
add an event there, click an item to edit or delete it. In Month, click a date (or use the arrow
keys and Enter) to open that day. Tasks get a tick box. Repeats can be every
day, every week or every weekday; a repeat set somewhere else (say, monthly in Google Calendar)
is kept as it is when you edit the event. Reminders are sent to Google Calendar with the event,
and Google notifies my phone.

Keyboard shortcuts on the Calendar page: `T` today, `J`/`K` (or ←/→) next and previous, `D` `W`
`M` to switch views, `N` for a new event. They're ignored while you're typing or a dialog is open.

If a habit has a reminder time and isn't done by then, a quiet desktop notification shows up
(within the hour, once a day). Clicking it opens Today. It only works while AwakeN is running.

Settings has the theme (system, light, dark), which day the week starts on, and a switch for
reminder notifications.

Settings also has a **Google Calendar** section. **Connect Google Calendar** opens Google's
sign-in page in your normal browser; once you allow access, the tab says you can close it and
Settings shows the connected account. **Disconnect** revokes AwakeN's access with Google and
forgets the sign-in. Your events in AwakeN stay as they are. If Google stops accepting the
sign-in (you removed access, or the Google project is in Testing mode, where sign-ins expire
after about 7 days), Settings says "Google sign-in expired" and offers **Reconnect**.

### Syncing to Google Calendar

While Google is connected, every event and task you create, edit or delete in AwakeN is sent to
your **primary** Google calendar. It's one way for now: changes made in Google don't come back
until Phase 7.

- **What's sent**: title, description, start and end (timed events in the Asia/Kolkata time zone,
  all-day events as dates), the repeat rule (including a custom one set in Google), and each
  reminder as a popup notification instead of the calendar's default reminders (Google allows 5).
  Tasks become normal Google events with a hidden `awakenKind = task` tag. Ticking a task off
  only changes it in AwakeN for now.
- **When**: a moment after each change, when the app starts, and every 2 minutes.
- **Status**: the Calendar toolbar says "Synced 2 min ago", "3 changes waiting" or
  "1 event failed to sync". Click the last one for the list of failed events, each with the
  reason and a **Retry** button. Failed events also show a small warning triangle in every view.
- **Offline**: everything keeps working. Changes wait and go up once the internet is back (it
  retries after 15 s, 30 s, 1 min, then every 2 min).
- **Safe by default**: AwakeN only changes or deletes a Google event if it's still the version
  AwakeN last saw there. If you changed it in Google in the meantime, AwakeN leaves it alone and
  marks the event as failed; Phase 7 will sort those out. A delete is kept in AwakeN's database
  until Google confirms it.
- **Connecting with events already in AwakeN**: it asks once, "Upload N existing events to
  Google Calendar?" With **Not now** they stay on this computer; Settings has an **Upload to
  Google** button for later. Nothing syncs while Google isn't connected.
- If the sign-in expires, syncing pauses ("Needs reconnect" in the toolbar) and changes wait
  until you reconnect.

## Running it

You need Node 20 or newer (I'm on 24).

```bash
npm install
npm run dev
```

In development, Settings has an **Add sample data** button. It fills an *empty* database with
four habits (about four months of ticks) and a week of events and tasks, and refuses if any
habit or event already exists. It isn't in packaged builds.

### Google sign-in setup

Google sign-in needs your own OAuth client from Google Cloud Console (a **Desktop app** client,
with the Google Calendar API enabled and yourself added as a test user). Copy `.env.example` to
`.env` and fill in the two values:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

`.env` is git-ignored. Restart `npm run dev` after changing it. Without it, Settings says sign-in
isn't set up and everything else works as normal.

How it works: AwakeN opens the sign-in page with PKCE (S256) and a random `state`, and waits for
Google's reply on a one-off server at `http://127.0.0.1:<random port>`. That server stops after
one reply, after 5 minutes, or when you press Cancel. It asks for `openid` and `email` (only to
show which account is connected) and `calendar.events`, nothing else. The refresh token is
encrypted with Electron's `safeStorage` (Windows DPAPI) in `google-account.bin` next to the
database, never in SQLite or the window. The access token is kept in memory only. In
development, Settings also has a **Test connection** button that reads your next event.

Other scripts:

```bash
npm test           # vitest
npm run typecheck  # tsc on main, renderer and core
npm run build      # production build into out/
npm run check:native  # confirms better-sqlite3 loads in both Node and Electron
```

There's no rebuild step for `better-sqlite3`. It's a Node-API module and ships prebuilt
binaries, so the same file works in plain Node (the tests) and in Electron (the app). The
project `.npmrc` sets `ignore-scripts=true`, because otherwise npm tries to compile
`better-sqlite3` with node-gyp on a fresh install, which needs Visual Studio on Windows. Electron
downloads its own binary the first time it runs. If a future upgrade breaks this,
`npm run check:native` will say which runtime failed.

The database ends up in Electron's user data folder (`%APPDATA%\awaken\awaken.db` on Windows).

## How it's laid out

```
src/
  core/      habit, streak and recurrence logic, no Electron or React in here
  main/      Electron main process and all the SQLite access
  preload/   exposes window.api to the renderer
  renderer/  the React UI
  shared/    IPC channel names and types used by both sides
migrations/  SQL files, run in order on startup
```

The renderer never touches the database directly. It goes through `window.api`, which is typed
in `src/shared/ipc.ts` from one map of channels to arguments and results. The main process
checks every argument (`src/main/validation.ts`) before it reaches SQLite. I kept `src/core` free of Electron and React so I can reuse it if I ever
build a phone version.

Built with Electron, Vite, React, TypeScript, better-sqlite3, google-auth-library and Vitest.
