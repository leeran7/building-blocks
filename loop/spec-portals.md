# Spec: web-portal builds (CrazyGames, YouTube Playables, itch.io)

Issue #267, workstream A of `plans/multi-platform-build.md`. Branch off the
build-targets foundation (`claude/project-thread-ew44n1`).

## Goal

Ship Doomstack's endless Free Climb as three self-contained HTML5 zips, one per
portal, from the existing mobile SPA build, with each portal's SDK wired in and
nothing else: no account, API, shop, duels, replays, or external links.

## Scope

In:
- `PortalApp` shell shared by the three portal targets' `root.tsx`.
- CrazyGames SDK v3 platform + ads adapters; YouTube Playables platform
  adapter; itch.io uses the no-op adapters.
- Per-target `<head>` snippet injection in `mobile/vite.config.mts` (YouTube SDK).
- `pnpm portal:package <target>`: build, check, zip.

Out (Future):
- Rewarded ads and any revive (sim-change gates; after CrazyGames Basic Launch).
- Localisation (English only).
- Portal leaderboards, cloud sync between devices, achievements.
- Trimming the climber atlases `main.tsx` bundles for every target (~8 MB);
  portals draw the stick figure only.

Assumptions:
- A0: "first 3 minutes of the session" is measured from when the ads adapter
  is created (module evaluation, i.e. page load).
- A1: "new best" means beating a previously saved best (whole feet). The first
  run on a device sets the best silently: nothing to celebrate yet.
- A2: MB limits are decimal (1 MB = 1,000,000 bytes) and apply to the
  uncompressed total of `dist-<target>`; this is the stricter reading.

## Flows

- **F-1 First play.** Portal loads the iframe -> menu with title, one-line
  goal, controls hint, Start (focused) -> countdown -> climb.
  Empty state: no best yet, so no best line. Default: Start has focus, so
  Enter/Space starts.
- **F-2 Death and instant restart.** Lava catches the climber -> results
  (height, New best or Best) -> Play again -> (CrazyGames: midgame ad break
  once the session is 3+ minutes old) -> countdown.
  Failure: ad errors or is blocked -> the run starts as if no ad was asked.
- **F-3 Pause.** Host pauses (YouTube overlay, tab hidden) or player presses
  Pause / P -> sim, music and input freeze -> Resume button (focused).
- **F-4 Audio.** Sound toggle on the menu and in the HUD cog; host can force
  silence (YouTube audio flag, CrazyGames `muteAudio`, an ad playing) without
  changing the saved preference.
- **F-5 Offline / SDK blocked.** SDK script fails or times out -> every call is
  a no-op, saves fall back to localStorage, the game plays normally.
- **F-6 Release.** Developer runs `pnpm portal:package <target>` -> zip in
  `mobile/dist-zips/` or a failed build naming each violation.

## Personas

- P-1 Portal browser player (desktop, keyboard, 821x462 iframe). F-1..F-5.
- P-2 Phone player on a portal's mobile site (portrait, touch). F-1..F-5.
- P-3 Developer shipping a build (Leeran). F-6.

## Stories and acceptance criteria

S-1 (P-1, F-1) As a portal player, I want to be in the game in one click, so
that I can judge it in seconds.
- AC-1 Given a fresh load, when the menu shows, then it holds exactly one
  primary action, Start, and no sign-in, guest, onboarding or splash UI.
- AC-2 Given the menu, when Start is activated, then a run begins (countdown)
  and `platform.gameplayStart` is called once.
- AC-3 Given any portal build, then its JS contains none of `doomstack.lol`,
  `firebaseapp.com`, `identitytoolkit` (package check fails otherwise).

S-2 (P-1/P-2, F-2) As a player, I want to restart instantly after dying.
- AC-4 Given a live run, when the player dies, then `gameplayStop` is called
  once and the results show the run's height.
- AC-5 Given a saved best B and a run peaking above B (whole feet), then the
  new best is saved via `platform.saveData` and `happyMoment` is called once;
  given a run at or below B, or no saved best, `happyMoment` is not called.
- AC-6 Given CrazyGames and a session younger than 3 minutes, when Play again
  is chosen, then no ad is requested.
- AC-7 Given CrazyGames and a session of 3+ minutes, when Play again is chosen,
  then `requestAd("midgame")` is called, input is blocked until it settles,
  audio is silenced only after `adStarted`, and the run then starts; an
  `adError` resolves as "error" (never "finished") and the run still starts.

S-3 (P-1/P-2, F-3) As a player, I want the game to stop when the host or I pause.
- AC-8 Given a live run, when `onPauseChange(true)` fires, then the simulation
  stops advancing, music stops and `gameplayStop` is called; resuming calls
  `gameplayStart`.
- AC-9 Given any portal screen, Escape is never handled by the portal (the
  settings panel closes via the cog or a click outside).

S-4 (P-1/P-2, F-4) As a player, I want sound that obeys me and the host.
- AC-10 Given `isAudioAllowed()` is false, then game audio is silent and the
  saved mute preference is unchanged.

S-5 (P-2, F-1/F-2) As a phone player, I want touch controls and a legible game.
- AC-11 Given a coarse pointer, then the on-screen controls show during a run;
  given a fine pointer they do not and the keyboard drives the climber.
- AC-12 Given 821x462 and 390x844 viewports, then the canvas fits the viewport
  without scrolling and the HUD readouts are fully visible.

S-6 (P-1, F-5) As a player with an ad blocker, I still get the game.
- AC-13 Given the SDK script fails or `SDK.init` throws, then `init()` resolves,
  every adapter method returns without throwing, and saves use localStorage.

S-7 (P-3, F-6) As the developer, I want a zip the portal accepts first time.
- AC-14 `pnpm portal:package <t>` exits non-zero when: `index.html` is not at
  the root; an asset URL is root-absolute; >1500 files; size over the target's
  limit (CrazyGames 50 MB fail / 20 MB warn, YouTube >= 30 MB fail); or a
  forbidden origin appears. It prints the size and file count otherwise.

## NFRs

- Playable at 60 fps on a mid-range laptop in an 821x462 iframe at DPR 1.
- Zero network requests other than the bundle's own files and the host SDK.
- WCAG 2.1 AA for menu/results text; 44px touch targets.
- Zip sizes: CrazyGames <= 20 MB (mobile homepage), YouTube < 30 MB.

## Work split

One stream (this branch). Shared files touched, backward compatible:
`mobile/vite.config.mts` (head snippet), `src/game/useClimb.ts` (`paused`
option, modifier keys ignored), `src/components/Game/usePowerUpFeedback.ts`
(`silenced` option), `GameSettings.tsx` / `ExpeditionHud.tsx` (`escapeCloses`).

## Risks

- CrazyGames and YouTube SDK APIs are external and unversioned in-repo; types
  are declared locally from public docs and every call is guarded.
- YouTube review may require `firstFrameReady` earlier than first paint.
- Portal QA may flag the 3 s countdown as not "instant"; it is part of the sim.

## Open questions

- None blocking. Rewarded revive deferred by the plan.
