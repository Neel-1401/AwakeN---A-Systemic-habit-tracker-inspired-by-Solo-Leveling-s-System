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

Early. I'm building it in phases. The first five are done; pushing events to Google Calendar is next.

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
- [ ] 6. Push events to Google Calendar
- [ ] 7. Pull changes back from Google, offline queue
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
is kept as it is when you edit the event. Reminders are saved with each event but nothing sends
them until events sync to Google Calendar in Phase 6.

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
after about 7 days), Settings says "Google sign-in expired" and offers **Reconnect**. Nothing is
synced yet; that's Phase 6.

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
