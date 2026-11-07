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

Early. I'm building it in phases. The first two are done and the third is in progress.

- [x] **1. Foundation**: Electron + React + TypeScript, the SQLite schema, and IPC between the
      window and the database
- [x] **2. Core logic**: when habits are due, streaks, repeating events
- [ ] 3. Habits screen, in four steps:
  - [x] 3a. Database and IPC: habit colour, reminder time and start day; completing, undoing
        and backfilling days; every request checked in the main process
  - [x] 3b. App layout and the Today view, the New/Edit habit dialog, theme settings
  - [ ] 3c. Month and Year views
  - [ ] 3d. Habit reminders as desktop notifications
- [ ] 4. Calendar (local only)
- [ ] 5. Google sign-in
- [ ] 6. Push events to Google Calendar
- [ ] 7. Pull changes back from Google, offline queue
- [ ] 8. Polish and installers

If you run it now you get the Habits page: add and edit habits, tick them off for today, backfill
the last 7 days, and see current and best streaks. Settings has the theme (system, light, dark)
and which day the week starts on. Month and Year views come next.

## Running it

You need Node 20 or newer (I'm on 24).

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm test           # vitest
npm run typecheck  # tsc on main, renderer and core
npm run build      # production build into out/
```

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

Built with Electron, Vite, React, TypeScript, better-sqlite3 and Vitest.
