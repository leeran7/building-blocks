# QA Acceptance Report — share-first export (no download when canShare)

**Goal:** Native share immediately after encode; no download when `canShare`  
**Branch:** `cursor/share-immediate-b391`  
**Date:** 2026-09-06T18:29:28Z  
**Agent:** qa-acceptance  
**Spec:** `loop/spec-share-immediate.md` (AC-SI-1…5)  
**Verdict:** **PASS** → integrator

## Method

1. Re-ran production-invoking vitest (22/22 related) + `pnpm typecheck` (pass).
2. Code inspection: `onstop` File-only; `startExport` awaits `encodePromise` then `deliverExportFile`; click sites ClimbScene + ReplayTransportBar; Share ≥44×44 + “Share complete” wiring.
3. Playwright Chromium (iPhone 12) smoke on live `/play?r=` with injectable `canShare`/`share` mocks and `<a download>` click spy — assert download **not** triggered when canShare true.
4. No source-text greps as AC proof (kernel gate).

## Unit evidence

| Suite | Result |
| --- | --- |
| `exportDelivery.test.ts` | 8 pass |
| `shareVideoFile.test.ts` | 9 pass |
| `exportMime.test.ts` | 5 pass |
| **Total** | **22/22** |
| `pnpm typecheck` | pass |

## Browser smoke highlights

Base: `http://127.0.0.1:3010/play?r=<qa-export token>` · device: iPhone 12 · mocks: `navigator.canShare` / `navigator.share` + patched `HTMLAnchorElement.click` for `[download]`.

| Partition | Label | share() calls | `<a download>` clicks | Share btn | Notes |
| --- | --- | --- | --- | --- | --- |
| canShare→true | READY TO SHARE MP4 | 1 (auto after Export) | **0** | visible 48.5×44 | createObjectURL count 0; Share click → aria-live `Share complete 3`; file `climb-99m-20260906.mp4` / `video/mp4` |
| canShare→false | DOWNLOADED MP4 | 0 | **1** | hidden | download `climb-99m-20260906.mp4` blob URL |

## AC matrix

| AC | Status | Expected | Actual / evidence |
| --- | --- | --- | --- |
| AC-SI-1 | **pass** | canShare true → no downloadBlob / `<a download>` | Unit: `deliverExportFile` download not called; Playwright: downloadClicks=0, createObjectURLs=0 when mocked canShare true |
| AC-SI-2 | **pass** | canShare false → download still occurs | Unit: download once, share never; Playwright: downloadClicks=1, DOWNLOADED MP4 |
| AC-SI-3 | **pass** | share once in Export click async chain after await encode; Share ≥44×44 on abort/unsupported | Inspection: onstop File-only; await encodePromise → deliverExportFile; Playwright: shareCalls=1 after Export before retry click; Share 48.5×44 remains |
| AC-SI-4 | **pass** | Share click after share-first success → aria-live Share complete | Playwright: Share click → `Share complete 3`; unit+wiring: exportSuccessLabel Ready to share; speak on shared/ok |
| AC-SI-5 | **pass** | WebM/MP4 MIME honesty unchanged (AC-NS-8) | Unit pickExportMime never labels WebM as MP4; Playwright fileType `video/mp4` for MP4 path |

## Residuals / risk

| Item | Risk | Why not fail |
| --- | --- | --- |
| Physical iOS/Android OS sheet | Low | Product contract is Web Share Level 2; mocked navigator.share proves no-download + share wiring |
| UA activation loss after long encode | Low | Spec allows Share retry; AC-SI-3 structural await chain + Share ≥44×44 proven |
| Delivery re-entry / late setStatus (reviewer warnings) | Low | Not AC-SI; note for follow-up — Export enabled during deliverExportFile settlement |
| Delta spec has no Flows F-n inventory | Low | Intentional UX delta on native-share; primary Export→share-first path walked end-to-end |

## Exploratory

- canShare true: success copy is Ready to share (not Downloaded); Share + Dismiss present.
- canShare false: Downloaded + Dismiss only; Share absent (negative partition).
- Double Export while delivery in flight: known reviewer warning (session cleared early) — not an AC fail.
- Abort path covered by unit (`aborted` shareResult → no download); Share retry chrome remains when canShare.

## Applied learnings

- Invoked `deliverExportFile` / `resolveExportDelivery` / `shareVideoFile` / `pickExportMime` — no source greps.
- Mocked canShare/share in Playwright (desktop Chromium lacks file share) per prior QA lesson.
- Confirmed AC-SI-3 against startExport await order (onstop File-only), not superseded onstop-share.
- Did not loopBack for activation survival or announce unit residuals once Playwright closed them.
- Did not reopen free-leaderboard trust boundary.
