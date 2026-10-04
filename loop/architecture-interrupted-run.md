# Architecture: interrupted level run notice (mobile)

**Spec:** `loop/spec-interrupted-run.md`. Mobile only (`app/mobile/src`), with no server or API change.

## Pieces
- `lib/levels/runNote.ts`
  - `parseRunNote`: allow-list parser that returns null on anything malformed.
  - `createRunNoteStore({accountId, load, save, remove})`: key `doomstack:levels:run-in-progress:v1:<uid|anon>`.
  - `markTicketLive` / `isTicketLive`: a module-level id of the ticket this JS session issued most recently. A reload or restart resets it.
  - `runNoticeFor`: a pure decision that returns the notice and whether to consume the note.
- `LevelsContext`: exposes `runNotes` (injectable, like `bestFails`).
- `LevelMapScreen`
  - `startLevel` marks the ticket live and saves the note.
  - A layout effect, once per `location.key`, runs `runNoticeFor` and consumes the note. It also handles `openLevel` and the new `interrupted` state.
  - The notice renders on the matching start sheet (`notice` prop) or as a dismissible map banner.
- `LevelPlayScreen`
  - Accepts a ticket from router state only when `isTicketLive`. Otherwise it bounces with `{openLevel, interrupted: true}`.
  - A successful submit clears the note. A retry saves a new note. `toMap` (Quit, Map, Next level) clears the note.

## ADR: session-live ticket instead of trusting router state
react-router 7.18.3 `createHashHistory` writes `{usr: state}` with `history.pushState`, and on load it reads `globalHistory.state.usr` (`react-router/dist/development/chunk-BV7QT456.mjs`, `createHashLocation` lines 162-178 and `getHistoryState` lines 222-224). Browsers keep `history.state` across a reload, so a reloaded play route used to remount `LevelRun` on the same ticket. That gave a free retry on one spent life. Accepting only a ticket this JS session issued closes that hole and sends the reload to the interrupted notice.

## Failure modes
- localStorage unavailable: the note is not saved, and no notice shows. Play is unaffected.
- A note from an older season is dropped silently.
