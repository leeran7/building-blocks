# Spec: say when a level run was interrupted (mobile)

**Goal:** a normal level run that loses its ticket (reload, app restart, stale link) no longer drops the player on a bare map in silence. No refund and no resume (user decision): the map only says what happened.

## Scope
- In: device-side run note (`app/mobile/src/lib/levels/runNote.ts`), the bounce from `LevelPlayScreen`, the notice on `LevelStartSheet` / the map, and refusing a ticket restored from `history.state` after a reload.
- Out: server changes, refunds, resuming a run, the web `/play` route.

## Flows
- F-1 Restart mid-run: run starts -> the app is killed -> cold launch lands on `/` -> one-time notice on the map -> note cleared.
- F-2 Reload mid-run (web or webview reload): `history.state` still holds the ticket -> play screen refuses it (not issued this session) -> bounce to the level's card -> notice -> note cleared.
- F-3 Stale link: `/levels/N/play` with no ticket and no note -> level N's card with "That run has ended." (map banner when N is above the frontier).
- F-4 Normal finish, quit, or Map from the failed-save card: the note is cleared, and the map says nothing.
- F-5 Leaving the play route another way (browser Back, Android hardware back): treated as Quit. The ticket stops being live and the note is cleared. Forward to the same history entry bounces like F-2 ("That run has ended."), so it does not replay the ticket.

## Acceptance criteria
- AC-1 Given a level starts (map Play or result Retry), then `{season, level, ticketId, costsLife}` is stored for the account, replacing any older note.
- AC-2 Given `submitResult` resolves for the ticket, then the note is cleared. If it rejects, the note stays until the player leaves with Map.
- AC-3 Given a note from an earlier session (same season), when the map loads on a plain visit, then it shows "Your last run of level N was interrupted, so it counts as a loss" (plus "and used a life" when costsLife) once, and clears the note.
- AC-4 Given a note for this session's live ticket, when the map remounts on a plain visit, then it shows nothing and keeps the note.
- AC-4b Given a run in progress, when its play screen unmounts without a submit (Back, hardware back), then the ticket is no longer live and the note is cleared. React StrictMode's dev remount does neither.
- AC-5 Given the play route has no live ticket in a normal run, then it navigates to `/` with `{openLevel, interrupted: true}`, mounts no run, and the card shows the notice. With no note the notice is "That run has ended." and says nothing about lives.
- AC-6 Given a malformed stored note, then the parser returns null and no notice shows.
- AC-7 Given a note from another season, then it is cleared without naming its level.
- AC-8 Given a bounce to level A's card and a note for level B, then level B's card opens with the notice when B is at or below the frontier. Otherwise no card opens and only the banner shows.
- AC-9 Given the map's landing effect runs again for the same history entry (StrictMode, a season refresh), then the card and notice it opened stay as they are.

## NFRs
- No network calls added. One localStorage read per map history entry. The notice has role=status. The dismiss target is 44x44.

## Risks
- The server closes an open ticket only when the next ticket is issued. A restart inside the bad-start window refunds the life, so "used a life" can be wrong in that rare case. Accepted.
- If a failed submit actually reached the server, a later restart can still show the notice. Accepted and documented.
- If the app is killed during "Checking your run…", the submit may still land on the server. The next launch then says the run "counts as a loss", which is wrong for a run that cleared the level. Accepted.
- The server keeps a ticket open for 24h. The client guards (live ticket, release on leave) stop only casual replay, such as reload or Back then Forward. A modified client can still replay a ticket within that window. Real enforcement is the server's job.
