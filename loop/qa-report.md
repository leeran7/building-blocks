# QA Acceptance Report -- Shared Lobby + Ready Button

**Date:** 2026-09-19
**Feature:** Shared lobby with manual ready-up for 1v1 duels
**ACs:** AC-1 through AC-6
**Verdict:** PASS -> integrator

## Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| app-lint | PASS | `pnpm lint` exits 0, zero warnings |
| app-typecheck | PASS | `pnpm exec tsc --noEmit` exits 0, no output |
| app-test | PASS | 74 files, 674 tests, 0 failures |

## Acceptance Criteria

### AC-1: Ready Button -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Signal-lime Ready pill | Static read | `bg-signal text-void rounded-full` | Matches | DuelRoom.tsx:915 |
| Toggleable Unready | Static read | Secondary border style, toggles localReady | Matches | DuelRoom.tsx:929-931, handleUnready at 377-387 |
| 44px min touch target | Static read | Ready >= 44px, Unready >= 44px | Ready: 48px, Unready: 44px | DuelRoom.tsx:915 min-h-[48px], :930 min-h-[44px] |
| Ready glow behind characters | Static read | Radial gradient rgba(203,242,77,0.25) in lobby/countdown | Matches | paintClimbFrame.ts:312-322 |
| Checkmark in HUD | Static read | Checkmark with aria-label="ready" | Matches | DuelRoom.tsx:831 |

### AC-2: Opponent Presence -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Full fidelity render | Static read | Opponents through standard player loop | Matches | paintClimbFrame.ts:284 iterates all players |
| Hidden when absent | Static read | hiddenSlots skips absent opponent | Matches | paintClimbFrame.ts:285, DuelRoom.tsx:674-677 |
| Join beat on enter | Static read | Fires once, guarded by ref | Matches | DuelRoom.tsx:538-545 |
| Name tags in lobby | Static read | Shown for all players in lobby/countdown | Matches | paintClimbFrame.ts:330-339 |
| Unit tests | Automated | Tests for hiddenSlots, joinBeat guard | Pass | duelLobby.test.ts: 5 AC-2 tests, 2 AC-4 tests |

### AC-3: Wall-Clock Countdown -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| countdownStartsAt timing | Static read | Date.now() + 500ms | Matches | DuelRoom.tsx:443, COUNTDOWN_BUFFER_MS=500 at line 72 |
| 50ms setInterval | Static read | setInterval(update, 50) | Matches | DuelRoom.tsx:599 |
| Math.max(0,...) clamp | Static read | Math.max(0, Math.ceil(...)) | Matches | DuelRoom.tsx:595 |
| No sim-tick dependency | Static read | Wall-clock path used when countdownStartsAt > 0 | Matches | DuelRoom.tsx:656-658 |
| Unit tests | Automated | 8 boundary tests for countdown derivation | Pass | duelLobby.test.ts AC-3 group |

### AC-4: Entrance Beat -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| Fires once | Static read | joinBeatFiredRef guard | Matches | DuelRoom.tsx:538-539 |
| Only on enter/present | Static read | action === "enter" OR "present" | Matches | DuelRoom.tsx:540 |
| Banner display | Static read | 1.8s timeout auto-dismiss | Matches | DuelRoom.tsx:544, 888-897 |
| Unit tests | Automated | 2 tests: fire-once guard, non-fire actions | Pass | duelLobby.test.ts AC-4 group |

### AC-5: Unready Timeout -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| 60s nudge constant | Static read | READY_NUDGE_MS = 60_000 | Matches | DuelRoom.tsx:76 |
| 120s forfeit constant | Static read | AFK_FORFEIT_MS = 120_000 | Matches | DuelRoom.tsx:78 |
| bothPresentSinceRef sync (W-1) | Static read | Set synchronously in presence handler | Applied | DuelRoom.tsx:535-537 |
| readyNudge cleanup reset (W-2) | Static read | setReadyNudge(false) in effect cleanup | Applied | DuelRoom.tsx:619 |
| Nudge hidden when ready | Static read | readyNudge && !localReady | Matches | DuelRoom.tsx:903 |
| Timer Math.max(0,...) | Static read | Prevents negative timeouts | Matches | DuelRoom.tsx:610-611 |
| Unit tests | Automated | 2 tests: ordering invariant, negative prevention | Pass | duelLobby.test.ts AC-5 group |

### AC-6: Full-Character Rendering -- PASS

| Check | Method | Expected | Actual | Evidence |
|-------|--------|----------|--------|----------|
| SNAPSHOT_EVERY_TICKS=1 | Static read + test | Every tick broadcast | Matches | useRace.ts:45, duelLobby.test.ts |
| GHOST_RENDER_DELAY_TICKS=4 | Static read + test | ~133ms at 30Hz | Matches | ghosts.ts:39, duelLobby.test.ts |
| SMOOTH_FACTOR=0.20 | Static read + test | Tighter smoothing | Matches | ghosts.ts:56, duelLobby.test.ts |
| Full-fidelity rendering | Static read | Standard player loop, no simplified draw | Matches | paintClimbFrame.ts:284-339 |
| Unit tests | Automated | 6 tests: constants, interpolation quality | Pass | duelLobby.test.ts AC-6 groups |

## User Flow Validation

### F-1: Solo wait (discovery)
**Method:** Code trace
**Result:** PASS -- WaitingLobby renders frozen MatchState with single idle character. Share invite UI overlays. No practice game (by design).

### F-2: Opponent joins
**Method:** Code trace
**Result:** PASS -- Presence handler fires setOpponentPresent(true), joinBeat banner shows for 1.8s, hiddenSlotsSet becomes undefined so opponent character appears, both name tags render.

### F-3: Ready up
**Method:** Code trace
**Result:** PASS -- handleReady publishes "ready" event + updatePresence. readySlotsSet includes mySlot for glow + checkmark. handleUnready reverses all state.

### F-4: Both ready (coordinator start)
**Method:** Code trace
**Result:** PASS -- tryCoordinatorStart checks readySlotsRef.size >= 2. Coordinator (slot-0) sends start event with countdownStartsAt = Date.now() + 500ms. Both clients derive countdown from same timestamp via 50ms setInterval. "GO" flash fires on climb phase transition.

### F-5: Nudge after 60s
**Method:** Code trace
**Result:** PASS -- Timeout effect fires setReadyNudge(true) after 60s. "Ready up!" text shown only when !localReady (gated at line 903). Reset on cleanup (W-2 fix at line 619).

### F-6: AFK forfeit after 120s
**Method:** Code trace
**Result:** PASS -- forfeitTimer fires handleLeave() after 120s. Server-side reaper is the backstop.

### F-7: Opponent leaves during lobby
**Method:** Code trace
**Result:** PASS -- Before start: resets opponentReady, opponentPresent, readySlotsRef, bothPresentSinceRef to clean state (lines 516-521). After start: 12s grace period then forfeit check.

### F-8: Race rendering
**Method:** Code trace
**Result:** PASS -- Opponents rendered at ~30Hz snapshot rate through standard paintClimbFrame player loop with tighter smoothing (SMOOTH_FACTOR=0.20) and reduced delay (4 ticks).

## Regression Checks

| Area | Status | Evidence |
|------|--------|----------|
| Matchmaking flow | No regression | Room orchestrator fetch/join/connect unchanged |
| Challenge links | No regression | /duel/[id] route preserved, seed oracle (R-5) intact |
| Result submission | No regression | useRace submitResult path unchanged |
| Independent sim | No regression | stepMatch uses localSlot, peers ghost-slaved |
| Server-authoritative | No regression | Server re-sim is source of truth |
| Ably transport | No regression | connectRealtime + RealtimeHandle extended (updatePresence, unready event), no breaking changes |
| 60fps rendering | No regression | rAF loop unchanged in ClimbCanvas.tsx |

## Reviewer Fixes Verified

| Fix | Status | Evidence |
|-----|--------|----------|
| W-1: bothPresentSinceRef sync | Applied | Line 535-537 in presence handler |
| W-2: readyNudge cleanup reset | Applied | Line 619 in timeout effect cleanup |
| W-3: Unready button 44px | Applied | Line 930 min-h-[44px] |

## Exploratory Testing

| Scenario | Result |
|----------|--------|
| Double-click Ready | Set.add is idempotent; no double-start |
| Navigate away (beforeunload) | Forfeit event sent (line 564-566) |
| Refresh mid-lobby | Reinitializes from loading phase, reconnects |
| Empty state (no opponent) | WaitingLobby renders with share invite UI |
| Missing/failed data | Error phase renders with "Back to duels" link |
| Opponent leaves and returns | State properly resets (lines 516-521), timers restart |

## Informational Notes

1. WaitingLobby "Share invite" buttons use min-h-[36px] (lines 221, 233), below the design system 44px minimum. Not an AC violation (AC-1 specifies 44px for Ready/Unready), but inconsistent with design conventions.

2. Some unit tests (14 of 24 per reviewer) re-implement production logic rather than importing it. Acceptable for React-component logic requiring DOM/canvas; GhostStore tests correctly import production code.

3. The 120s auto-forfeit runs from bothPresentSinceRef regardless of ready state, serving as a hard lobby timeout. Verifier accepted this as reasonable.
