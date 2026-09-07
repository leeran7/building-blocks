# Spec: Climb replay transport + MP4 export

**Product:** The Climb (building-blocks)  
**Goal ID:** replay-transport-export  
**Status:** draft → ready for architect  
**Date:** 2026-09-06

## Goal

When a climber opens a shared replay (`/play?r=…`), they can **pause, play, rewind, and fast-forward** the deterministic run, and **export a downloadable video** (MP4 when the browser can produce it) of that replay for social sharing — without leaving the replay surface or changing live play.

## Scope

### In scope

1. **Replay transport controls** on shared-replay sessions only (`ClimbScene` with a decoded `RunReplay`):
   - Pause / play
   - Rewind (fixed step + restart-from-start)
   - Fast-forward (discrete speed multipliers)
   - Scrub / seek to an arbitrary tick via a progress control
   - Keyboard shortcuts (desktop) and touch-reachable controls (mobile)
2. **Export as video** from a shared-replay session:
   - Client-side capture preferred
   - Progress UI, cancel, success download, and failure modes
   - Placement of the export action during replay and on the finished overlay
3. Accessibility minimums for the new chrome (WCAG 2.1 AA contrast, 44×44 targets, live-region announcements for transport state changes)
4. Edge cases listed under **Edge cases** below

### Out of scope / non-goals

- Changing `encodeRunReplay` / `decodeRunReplay` token format or `MAX_SHARE_TICKS` (18 000)
- Server-side video rendering, storage, CDN hosting, or watermarking service
- Editing the run (trim UI beyond “export from tick 0 → end”, overlays, titles, music beds)
- Exporting live (non-replay) climbs mid-run
- Changing live climb input, scoring, leaderboards, or share-link generation
- Audio export / muxing climb SFX into the video file (video frames only for v1)
- Picture-in-picture, casting, or third-party social upload APIs
- Resolving the free-leaderboard trust-boundary open question (unrelated; leave open)

### Assumptions

- Shared replays remain deterministic: same seed + input log ⇒ same tick states.
- Sim tick rate stays **30 Hz** (`TICK_HZ`); wall-clock playback at 1× advances one tick per `TICK_DT`.
- Replay viewers already land on `/play?r=` via `ClimbPlayClient` → `ClimbScene` with `replaying === true`.
- Design tokens and control patterns follow `app/DESIGN.md` (ASCENT: signal lime / ember on void). Architect / implementer do **not** invent a second visual language.
- “Export as MP4” means the **user-visible deliverable is a downloadable video file**. When the browser cannot encode MP4, a clearly labeled WebM (or equivalent) fallback is acceptable rather than a silent failure.

### Constraints

- Do not break live climb keyboard scoping (`shouldCaptureGameKey` / interactive targets). Replay shortcuts must not steal Space from focused buttons/links or scroll keys when a control is focused.
- Touch targets ≥ **44×44 CSS px** for every transport and export control.
- `prefers-reduced-motion: reduce` must not disable pause/play/seek; it may disable non-essential motion on the transport chrome only.
- Export must not POST the video to product servers in v1 (client download only).
- Package manager for `app/`: **pnpm**.

---

## Personas

### P1 — Spectator friend

Opens a shared `?r=` link on phone or laptop to watch a friend’s climb. Wants to skip the boring early floors, rewatch the near-death, and pause to react in chat.

### P2 — Climber sharer

Finished a run, shared the link, and now wants a short video file to post to X / Discord / Instagram Stories without screen-recording the browser.

### P3 — Mobile casual viewer

On a coarse-pointer phone, one-handed. Needs large tap targets; may not discover keyboard shortcuts.

---

## Stories

### S1 — Pause and play

**As a** spectator friend, **I want** to pause and resume a shared replay, **so that** I can look away or point out a moment without losing my place.

- **Happy path:** During countdown or climb, viewer taps/clicks Pause → sim freezes on the current tick; Play resumes from that tick at the current speed.
- **Failure case:** Viewer presses Pause after the run has already finished → control is disabled or acts as “Restart from start” only via an explicit Restart affordance (not a no-op labeled Pause).

### S2 — Rewind and seek

**As a** spectator friend, **I want** to jump backward in the replay (and scrub), **so that** I can rewatch a clutch section without reloading the page.

- **Happy path:** At tick T, viewer activates Rewind → playback position moves to `max(0, T − REWIND_STEP_TICKS)` and the scene shows that tick’s state; scrubbing the seek bar to 40% lands within ±1 tick of `floor(0.4 × totalTicks)`.
- **Failure case:** Rewind at tick 0 leaves position at 0 and does not throw or blank the canvas.

### S3 — Fast-forward

**As a** spectator friend, **I want** discrete faster-than-realtime speeds, **so that** I can skip slow early climbing without missing the ending.

- **Happy path:** Viewer cycles speed 1× → 2× → 4× → 1×; at 2×, wall-clock time for N ticks is approximately half of 1× (±10% over a ≥60-tick window when the tab is foregrounded).
- **Failure case:** Speed changes while paused update the **next** play rate but do not advance ticks until Play.

### S4 — Export video

**As a** climber sharer, **I want** to download a video of the shared replay, **so that** I can post it outside the product.

- **Happy path:** From a valid shared replay, viewer starts Export → sees determinate progress → browser downloads a file whose name matches the filename rule and whose duration equals the replay’s climb duration at 1× (±1 s for encoding overhead).
- **Failure case:** Unsupported capture / encoder → export does not hang; UI shows a dismissible error within 2 s of detecting unsupported, with no partial corrupt download forced on the user.

### S5 — Finished replay recovery

**As a** spectator friend, **I want** clear controls when the lava has already caught the climber, **so that** I can restart or export without confusion.

- **Happy path:** On finished overlay in replay mode, viewer can Restart (from tick 0, playing) and Export.
- **Failure case:** Fast-forward does not keep “playing” past the terminal tick; speed returns to a defined idle finished state.

---

## Acceptance criteria

### Transport — presence & placement

**AC-1.** Given a valid `/play?r=` replay has loaded and phase is `countdown` or `climb`, when the scene is visible, then a transport bar is visible containing at least: Play/Pause toggle, Rewind, Fast-forward (speed), Seek/progress, current speed label (`1x`/`2x`/`4x`), and Export.  
*(Negative: Given live play with no `replay` prop, when climbing, then none of those replay-only controls are mounted.)*

**AC-2.** Given a coarse-pointer (touch) viewport, when the transport bar is shown, then every interactive control in it has a hit target of at least 44×44 CSS pixels, and the bar does not cover the primary altitude/lava HUD readout (controls sit in a safe band — bottom overlay or under-HUD — without requiring horizontal scroll to reach Pause).

**AC-3.** Given desktop (≥1024 px width) and a focused non-interactive canvas region, when the viewer presses `Space` / `k`, then playback toggles pause↔play. When `J` is pressed, position moves back by `REWIND_STEP_TICKS`. When `L` or `.` is pressed, speed cycles 1×→2×→4×→1×. When `Home` or `0` is pressed, position seeks to tick 0.  
*(Negative: Given focus is on a `button`, `a[href]`, or form control, when those same keys are pressed, then the page’s default control behavior occurs and the replay position/speed does not change.)*

### Transport — pause / play

**AC-4.** Given a replaying climb at tick T≥0 with status playing, when the viewer activates Pause, then for the next ≥500 ms wall-clock the reported match tick remains T and the Play/Pause control exposes state `paused` to assistive tech (`aria-pressed` or equivalent).

**AC-5.** Given a paused replay at tick T, when the viewer activates Play, then within 250 ms wall-clock the tick advances beyond T at the selected speed (unless T is the final tick).

### Transport — rewind / seek / restart

**AC-6.** Define `REWIND_STEP_TICKS = 150` (5.0 s of sim time at 30 Hz). Given tick T, when Rewind is activated once, then the resulting tick equals `max(0, T − 150)` and the rendered player/hazard state matches a fresh deterministic simulation of the input log up through that tick (bit-identical peakY and player.y to a headless `stepMatch` loop for the same seed+inputs).

**AC-7.** Given total input length N≥2, when the seek control is set to ratio r ∈ {0, 0.5, 1}, then the resulting tick equals `clamp(round(r × (N − 1)), 0, N − 1)` (for r=1, tick may be the terminal finished tick).  
*(Negative: Given N≥1, when seeking to 0, then tick is 0 and phase is a playable replay phase, not a blank/error canvas.)*

**AC-8.** Given a finished replay overlay, when Restart is activated, then phase returns to countdown/climb from tick 0, speed is 1×, and transport controls are usable again.

### Transport — fast-forward

**AC-9.** Allowed speeds are exactly `{1, 2, 4}` (multiples of realtime). Given playing at speed S, when Fast-forward is activated, then speed becomes the next value in the cycle `1 → 2 → 4 → 1`, and the speed label updates to that value within one frame of UI state.

**AC-10.** Given a foreground tab, playing at 2× from tick 0, when 60 sim ticks have been applied, then elapsed wall-clock is in `[0.9 s, 1.2 s]` (expected 1.0 s at perfect 2××30 Hz). At 4×, 60 ticks complete in `[0.45 s, 0.70 s]`.  
*(Negative: Given paused at 4×, when 500 ms pass, then tick does not advance.)*

### Transport — finished & reduced motion

**AC-11.** Given the replay reaches `finished`/`results`, when no further inputs remain, then auto-advance stops, speed display may remain but ticks do not increase, and Pause is disabled or equivalent to a no-op while Restart and Export remain available.

**AC-12.** Given `prefers-reduced-motion: reduce`, when the viewer uses Pause, Seek, and Speed controls, then those controls still change tick/speed as in AC-4–AC-10; only decorative transitions on the chrome may be suppressed.

### Export — entry, limits, file

**AC-13.** Given a loaded shared replay (any phase after decode success), when Export is activated, then an export session starts that re-renders the run from tick 0 through the last input tick at **1× sim rate into the encoder** (export always encodes realtime 1× timeline regardless of the viewer’s current scrub position or speed), at **30 fps**, target frame size **720×1280** (9:16). If the on-screen canvas differs, frames are scaled to 720×1280 before encode.

**AC-14.** Duration / size envelope: export is allowed for any replay the product already accepts for sharing (`1…MAX_SHARE_TICKS` inputs). Given N ticks, expected media duration is `N / 30` seconds (±1.0 s). No separate shorter cap in v1.  
*(Negative: Given export already in progress, when Export is activated again, then a second encode does not start; the UI keeps the in-progress session.)*

**AC-15.** On success, the browser downloads a file named  
`climb-{peakMetres}m-{yyyyMMdd}.mp4`  
where `peakMetres` is the replay’s `peakY` rounded to integer, and `yyyyMMdd` is UTC date of export start.  
If the browser cannot produce MP4, the extension and MIME reflect the actual container (e.g. `.webm`) and the success UI string includes the format name (“Downloaded WebM” / “Downloaded MP4”).

**AC-16.** During export, a determinate progress indicator shows percent `floor(100 × currentTick / max(1, N − 1))` updated at least every 15 ticks or 250 ms, whichever comes first, plus an explicit Cancel action. Cancel stops encoding within 1 s and does not leave a forced download of a partial file.

### Export — failure modes

**AC-17.** Given `MediaRecorder` (or the chosen client capture path) is missing or rejects the requested MIME, when Export is activated, then within 2 s the UI shows a dismissible error: “Video export isn’t supported in this browser”, progress is cleared, and no download is triggered.

**AC-18.** Given an in-progress export, when the document becomes hidden (`visibilitychange` → hidden) for ≥3 s, then export either (a) continues to completion without requiring the tab to stay composited, or (b) pauses with a visible “Return to this tab to finish exporting” message and resumes when visible again — it must not fail silently with a 0-byte file.

**AC-19.** Given export fails for any other reason (encode error, out-of-memory, security error on canvas), when the failure is detected, then the UI shows a dismissible error including a short reason string, Cancel/idle state is restored within 2 s, and transport controls remain usable.

### Regression / live play

**AC-20.** Given a normal (non-replay) climb, when the player uses existing keyboard and touch controls, then behavior is unchanged: Space still jumps during climb when the game owns focus; Space still activates focused buttons in lobby/results; touch controls still mount only for live play.

---

## Speeds, seek, UX placement (normative)

| Control | Behavior |
| --- | --- |
| Play/Pause | Toggle. Default on load: **playing** (preserves today’s auto-start). |
| Speeds | `1×` (default), `2×`, `4×` only. Cycle via FF button or `L` / `.`. |
| Rewind | Jump back `150` ticks (5 s). Hold-repeat may fire at most every 200 ms. |
| Seek bar | Scrub to tick; on release/commit, resimulate to that tick then continue in prior play/pause state. |
| Restart | From finished overlay and optionally as a transport overflow; always tick 0, speed 1×, playing. |

**Placement**

- Desktop: transport bar overlaid on the lower portion of the play stage (above any safe margin), ASCENT tokens — `surface`/`void` translucent well, `signal` for active/playing, mono labels for speed/time.
- Mobile: same controls, larger targets; do **not** remount live `TouchControls` for movement during replay.
- Finished overlay: keep “▲ replay finished”, add **Restart** + **Export video** primary/secondary pair; “Play yourself →” link remains.
- Replace or augment the non-interactive “Watching replay” badge with a status that reflects Playing / Paused / Finished (still mono uppercase).

**Time readout:** `mm:ss` current / `mm:ss` total derived from `tick / 30` and `(N) / 30`.

---

## NFRs

| ID | Requirement | Measure |
| --- | --- | --- |
| NFR-1 | Seek / rewind correctness | AC-6 headless parity: player.y and peakY match within `1e-9` relative or absolute equality for floats already used by sim. |
| NFR-2 | Seek latency | Seek to an arbitrary tick ≤ 18 000 completes and paints within **500 ms** on a mid-tier laptop in Chromium (architect may use incremental caching; product only requires the bound). |
| NFR-3 | Export resolve | 60 s of sim (1800 ticks) encodes and triggers download within **90 s** wall-clock on the same class of device, tab foregrounded. |
| NFR-4 | A11y | WCAG 2.1 AA for new text/icons; contrast ≥ 4.5:1 for label text; all controls keyboard reachable; `aria-live` announcements for pause/play/speed/export complete include a monotonic suffix so repeats re-announce. |
| NFR-5 | Auth | No login required to watch or export a shared replay. |
| NFR-6 | Privacy | Export stays on-device; no upload of video bytes to product APIs. |
| NFR-7 | Scale envelope | Works for every currently shareable replay (`N ≤ 18 000`). No server horizontal scale (client-only feature). |
| NFR-8 | Perf isolation | Live climb frame path must not pay per-frame React state for export/transport when `replaying === false` (no new 60 fps React subscriptions on live play). |

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Browser MP4 support is uneven (`MediaRecorder` often WebM/VP8/VP9; Safari varies) | User expectation “MP4” unmet | AC-15 format-honest filename + label; document WebM fallback |
| Rewind via full resim from 0 is O(N) per seek | Long runs feel janky | NFR-2; architect may snapshot every K ticks — product does not mandate algorithm |
| Background tab throttles `rAF` / capture | Corrupt or stalled export | AC-18 explicit policy |
| Global shortcuts regress live play / mute / Start | Broken page UX (known prior incident) | AC-3 negative + AC-20 |
| Export includes HUD chrome unexpectedly | Ugly social clips | Architect decides: capture game canvas buffer without DOM overlays; product requires climber + tower + lava visible; transport chrome must **not** appear in the file |
| Legal / ToS of uploading others’ replays | Low for v1 client download | Out of scope; no server store |

---

## Edge cases (must handle)

1. **Finished replay** — AC-11, AC-8.
2. **Reduced motion** — AC-12.
3. **Long runs** — up to 18 000 ticks (~10 min); seek and export must remain usable (NFR-2, NFR-3 scaled linearly is acceptable if documented in architecture).
4. **Missing MediaRecorder / MIME** — AC-17.
5. **Invalid / failed decode** — existing invalid-link UI; no transport/export chrome.
6. **Export while paused mid-run** — still encodes full run from tick 0 (AC-13); viewer position unchanged after cancel; after success, viewer position unchanged unless Restart chosen.
7. **Double-click Export** — AC-14 negative.
8. **Tab hidden during playback** (not export) — existing clamp on large `dt` remains; on return, continue from current tick (no automatic skip-ahead beyond accumulator clamp).

---

## Open questions (non-blocking)

1. **Audio in export?** v1 = silent video. Confirm later if SFX/music should mux (Future).
2. **Exact MIME priority list** (e.g. `video/mp4;codecs=avc1` vs `video/webm;codecs=vp9`) — architect chooses; product only requires honest labeling (AC-15/17).
3. **Free-leaderboard trust boundary** (pre-existing ledger question) — **not** part of this feature; still unresolved for product at large.
4. **Optional design-ux pass** — tokens in `DESIGN.md` are sufficient to implement; a design-ux stage is **not** required before architect unless visual polish of the transport bar is prioritized after first implementation.

---

## Future

- In-export trim range (export only tick A–B)
- Burned-in peak altitude / handle end-card
- Audio mux (SFX + optional music)
- Server-side render for guaranteed MP4/H.264
- GIF / short preview for link unfurls
- Playback speed 0.5× and frame-step (`,`.`)
- Picture-in-picture

---

## Traceability

| Story | ACs |
| --- | --- |
| S1 Pause/play | AC-1, AC-3, AC-4, AC-5, AC-12, AC-20 |
| S2 Rewind/seek | AC-6, AC-7, AC-8 |
| S3 Fast-forward | AC-9, AC-10, AC-11 |
| S4 Export | AC-13–AC-19 |
| S5 Finished recovery | AC-8, AC-11 |

**AC count:** 20 (AC-1…AC-20)
