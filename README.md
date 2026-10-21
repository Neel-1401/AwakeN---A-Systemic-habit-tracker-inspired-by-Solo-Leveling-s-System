# AwakeN

A habit tracker and calendar for my desktop.

The idea started with the System from Solo Leveling: daily quests, streaks, something that keeps
you honest. This first version leaves out the levels and ranks. Right now I just want something
plain that I'll actually open every day:

- **Habits**: tick them off, keep a streak going, look back at a few months of history.
- **Calendar**: events and dated to-dos that sync with Google Calendar, so reminders reach my
  phone without the app needing its own notification system.

Everything is stored locally in SQLite. There's no account and no server.

## Where it's at

Early. I'm building it in phases and only the first one is done.

- [x] **1. Foundation**: Electron + React + TypeScript, the SQLite schema, and IPC between the
      window and the database
- [ ] 2. Core logic: when habits are due, streaks, repeating events
- [ ] 3. Habits screen
- [ ] 4. Calendar (local only)
- [ ] 5. Google sign-in
- [ ] 6. Push events to Google Calendar
- [ ] 7. Pull changes back from Google, offline queue
- [ ] 8. Polish and installers

If you run it now you'll get an empty window. That's expected for now.

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
in `src/shared/ipc.ts`. I kept `src/core` free of Electron and React so I can reuse it if I ever
build a phone version.

Built with Electron, Vite, React, TypeScript, better-sqlite3 and Vitest.
