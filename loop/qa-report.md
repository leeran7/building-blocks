# QA Acceptance Report — native share of exported climb video

**Goal:** After download, share climb replay MP4 via Apple & Android native share sheets  
**Branch:** `cursor/native-video-share-b391`  
**Date:** 2026-09-06T18:00:15Z  
**Agent:** qa-acceptance  
**Spec:** `loop/spec-native-share.md` (AC-NS-1…10)  
**Verdict:** **PASS** → integrator

## Method

1. Re-ran production-invoking vitest (32/32 related) + `pnpm typecheck` (pass).
2. Code inspection of non-test callers: `ClimbScene` → `ReplayTransportBar` / `useReplayExport` / `shareVideoFile`.
3. Playwright Chromium smoke on live `/play` and `/play?r=` with injectable `canShare`/`share` mocks (desktop Chromium does not expose file share natively).
4. No source-text greps as AC proof (kernel gate).

## Unit evidence

| Suite | Result |
| --- | --- |
| `shareVideoFile.test.ts` | 9 pass |
| `exportMime.test.ts` | 5 pass |
| `exportVisibility.test.ts` | 6 pass |
| `replayTransport.test.ts` | 12 pass |
| **Total** | **32/32** |
| `pnpm typecheck` | pass |

## Browser smoke highlights

- Live `/play`: transport=0, Share=0 (AC-NS-3).
- Replay before success: Share=0 (AC-NS-3).
- Native desktop Chromium after export: `Downloaded MP4`, Share=0, Dismiss=1 (AC-NS-1 negative / AC-NS-10).
- Mock `canShare→true`: Share mounts; box ≥44×44 (48.5×44 mobile, 48.5×44 iPhone 12) (AC-NS-1/2).
- Encode complete → `share()` call count before Share click = 0 (AC-NS-4 negative).
- Share click → `files:[File]` with `climb-99m-20260906.mp4` / `video/mp4` / size>0; title=file.name; no text (AC-NS-4/7).
- Fulfilled share → aria-live `Share complete 3` (monotonic suffix) (AC-NS-9).
- AbortError mock → transport `role=alert` count 0; success + Share remain (AC-NS-5).
- NotAllowedError mock → dismissible non-empty alert within 400ms (AC-NS-6).
- Dismiss → Share=0 and success chrome gone (AC-NS-7 negative).
- Mock `canShare→false` → Share=0, Dismiss=1; download label still shown (AC-NS-1 negative / AC-NS-10).

## AC matrix

| AC | Status | Expected | Actual / evidence |
| --- | --- | --- | --- |
| AC-NS-1 | **pass** | Share when canShare(files); hide otherwise | Unit canShare true/false/missing/throw; Playwright mount when mocked true; Share=0 when false/native desktop |
| AC-NS-2 | **pass** | Share hit target ≥44×44 | Playwright boundingBox 48.5×44 (390×844 + iPhone 12) |
| AC-NS-3 | **pass** | No Share off success / live play | Live Share=0; replay pre-success Share=0; JSX only under `kind===success`; bar gated `replaying` |
| AC-NS-4 | **pass** | share() from click with same file; no auto-share | Unit share payload; Playwright payloadsBeforeClick=0; sole caller Share onClick |
| AC-NS-5 | **pass** | AbortError quiet; success retained | Unit → aborted; Playwright abort → 0 transport alerts; Share+Downloaded remain |
| AC-NS-6 | **pass** | Non-abort → dismissible non-empty error | Unit NotAllowedError/empty→Share failed; Playwright alert `NOTALLOWEDERROR` |
| AC-NS-7 | **pass** | Retain File until dismiss/new export | onstop `File([blob],…)` retained; smoke name/type/size; dismiss clears Share |
| AC-NS-8 | **pass** | MIME-honest WebM/MP4 gate | Unit WebM probe+share `video/webm`; `containerMimeForLabel`; browser path MP4 honest |
| AC-NS-9 | **pass** | aria-live Share complete + monotonic | Playwright `Share complete 3`; `speak()` appends announceSeq |
| AC-NS-10 | **pass** | Download always; Share additive | onstop always `downloadBlob` then success; smoke Downloaded MP4 with Share hidden or shown |

## Residuals / risk

| Item | Risk | Why not fail |
| --- | --- | --- |
| Physical iOS/Android OS sheet UI | Low | Product contract is Web Share Level 2; mocked navigator.share proves wiring; real sheet is UA chrome |
| NFR-NS-2 ≤100ms click→share | Low | onClick awaits shareVideoFile first with no preceding awaits (ADR-NS-5); not wall-clock timed |
| Stale shareError after dismiss/re-export (reviewer warning) | Low | Not an AC; exploratory note for follow-up |
| Double-tap Share (reviewer info) | Low | Not an AC; OS may ignore concurrent share |

## Exploratory

- Double Export while success: new encode replaces status (Share unmounts on running).
- Navigate live ↔ replay: Share never on live.
- canShare throw/missing: treated unsupported (unit).
- Empty reject message → UI “Share failed” (unit).

## Applied learnings

- Invoked units + Playwright; no `navigator.share` source greps.
- Confirmed non-test caller of `shareVideoFile` is `ReplayTransportBar` only.
- Did not require download object-URL liveness for AC-NS-7 (File owns bytes).
- Did not reopen free-leaderboard trust boundary.
- Treated gesture/UI ACs as QA-owned; closed them with browser mocks rather than looping implementer.
