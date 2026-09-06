# QA Acceptance Report — replay transport + MP4 export

**Goal:** Climb replay pause/play, rewind, fast-forward, export MP4  
**Branch:** `cursor/replay-controls-export-b391`  
**Date:** 2026-09-06T16:23:06Z  
**Agent:** qa-acceptance  
**Verdict:** **PASS** → integrator

## Method

1. Re-ran production-invoking vitest (38/38) + `pnpm typecheck` (pass).
2. Code inspection of non-test callers (`ClimbScene` → `ReplayTransportBar` / `useReplayExport` / `useClimb`).
3. Browser smoke: `pnpm exec next dev -p 3010` + Playwright Chromium against `/play` and `/play?r=<token>`.
4. No source-text greps as AC proof (kernel gate).

## Unit evidence

| Suite | Result |
| --- | --- |
| `replayTransport.test.ts` | 12 pass |
| `replaySnapshots.test.ts` | 6 pass |
| `exportMime.test.ts` | 5 pass |
| `useClimb.replayTransport.test.ts` | 5 pass |
| `exportVisibility.test.ts` | 6 pass |
| `runReplay.test.ts` | 4 pass |
| **Total** | **38/38** |
| `pnpm typecheck` | pass |

## Browser smoke highlights

- Live `/play`: transport=0, Export=0 (AC-1 negative / AC-20).
- Replay: Pause/Play, Rewind, Speed, Seek, Export all mounted; speed label `1x`.
- Mobile 390×844: 5 transport controls ≥44×44 (AC-2).
- Space/k pause↔play; L/`.` speed 1→2→4→1; J rewind; Home→00:00; focused Export + Space does not toggle (AC-3).
- Pause freezes clock ≥500ms with Play affordance + `aria-pressed=false` (AC-4/5).
- Scrub while autoplaying: mid-drag value stayed ~0.71 (no snap-back).
- Seek ratios N=101: r=0→00:00, r=0.5→00:01, r=1→00:03 (AC-7).
- Restart from finished → speed `1x`, clock `00:00`; Pause disabled when finished (AC-8/11).
- Wall-clock: 2× 60 ticks = 1.049s; 4× = 0.518s; paused@4× no advance (AC-10).
- Export: progress + Cancel; double-export keeps one session; hidden≥3s shows “Return to this tab…”; download `climb-99m-20260906.mp4` + “Downloaded MP4” (AC-13–16, AC-18).
- `prefers-reduced-motion: reduce` still toggles pause/speed (AC-12).

## AC matrix

| AC | Status | Expected | Actual / evidence |
| --- | --- | --- | --- |
| AC-1 | **pass** | Transport bar on replay; absent on live | Browser: replay mounts all controls; live transport=0 |
| AC-2 | **pass** | ≥44×44 targets; bar usable | Browser mobile: 5 controls, bad=[] |
| AC-3 | **pass** | Space/k/J/L/./Home/0; interactive exempt | Browser + `shouldCaptureReplayKey` unit |
| AC-4 | **pass** | Pause freezes tick; paused a11y | Browser clock freeze + Play label / aria-pressed |
| AC-5 | **pass** | Play resumes | Browser Pause button returns after k |
| AC-6 | **pass** | Rewind 150 + oracle parity | Unit `ReplaySnapshotCache` + browser rewind smoke |
| AC-7 | **pass** | Seek ratios + scrub commit | Unit tickFromSeekRatio/commitScrubRatio + browser ratios |
| AC-8 | **pass** | Restart → tick0, 1× | Browser Restart |
| AC-9 | **pass** | Speeds {1,2,4} cycle | Unit + browser L cycle |
| AC-10 | **pass** | 2×/4× wall bands; paused no advance | Browser 1.049s / 0.518s; paused@4× stable |
| AC-11 | **pass** | Finished: no auto-advance; Pause disabled; Restart/Export | Browser pauseDisabled=true |
| AC-12 | **pass** | Reduced motion still controls | Browser emulateMedia reduce |
| AC-13 | **pass** | Encode 1× from 0 @30fps 720×1280 | Code EXPORT_* + browser MP4 download |
| AC-14 | **pass** | N/30 envelope; no double encode | Browser cancelCount=1; shareable N accepted |
| AC-15 | **pass** | Honest `climb-{peak}m-{yyyyMMdd}.{ext}` + label | Browser `climb-99m-20260906.mp4` + Downloaded MP4; MIME unit |
| AC-16 | **pass** | Determinate % + Cancel | Browser progress + cancel clears |
| AC-17 | **residual** | Unsupported → dismissible error ≤2s | Unit `pickExportMime(()=>false)→null` + immediate error wiring; Chromium always supports MR |
| AC-18 | **pass** | Hidden≥3s pause/resume message | Unit pause/resume helpers + browser hiddenMsg |
| AC-19 | **residual** | Other encode failures → error UI | Unit fail-closed pause/resume; `failSession`/`onerror` wired; no injected OOM in smoke |
| AC-20 | **pass** | Live keys/touch unchanged | Unit predicates + live page no transport; TouchControls `!replaying` |

## Residuals / risk

| Item | Risk | Why not fail |
| --- | --- | --- |
| AC-17 browser-forced unsupported | Low | Null MIME path unit-tested; UI string wired; Chromium cannot naturally hit |
| AC-19 injected encode OOM/security | Low | failSession + recorder.onerror present; helpers fail-closed |
| Exact media duration ±1s (AC-14) | Low | Download succeeded; encode loop is 1 frame/tick @30fps from tick 0 |
| Pixel HUD overlap vs altitude (AC-2 detail) | Low | Bar is bottom safe-area; 44px targets measured |

## Exploratory

- Double Export → single Cancel (pass).
- Navigate live ↔ replay → chrome mounts only when `?r=` (pass).
- Empty/invalid token → existing invalid UI (not re-broken; decode unit rejects malformed).
- Scrub under autoplay → thumb holds draft (pass).

## Overall

No failing ACs. Core transport + export proven by invoked units and Playwright against a running app. Residuals are environment-limited negatives with strong unit/code support and no contradictory evidence.

**nextStage:** integrator  
**loopBackTo:** none
