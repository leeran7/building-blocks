# QA Acceptance Report: Duel HUD Unification

**Date:** 2026-09-19
**Goal:** Unify 1v1 duel game UI with Free Climb / Daily pattern (ClimbScene + ExpeditionHud)
**Verdict:** PASS -- all ACs met, all flows validated, quality gates green

## Acceptance Criteria

### AC-1: ExpeditionHud renders height, lava clearance, utilities identically in duel

- **Method:** Automated tests (2 tests in expeditionHudDuel.test.tsx)
- **Expected:** HeightInstrument, LavaClearanceInstrument, UtilityControls render identically in both solo and duel modes.
- **Actual:** Same components render in both modes. Duel instruments are additive (exp-duel-strip below main HUD). Tests assert height "100.0 feet", clearance "50.0 feet", mute control, surge phase all appear identically in both solo and duel renders.
- **Evidence:** expeditionHudDuel.test.tsx lines 62-89.
- **Result:** PASS

### AC-2: Duel instruments only mount when duel prop provided; solo never renders them

- **Method:** Structural code review (call sites) + automated tests (2 tests)
- **Expected:** No exp-duel-strip, exp-versus, or exp-race-progress in solo; all present in duel.
- **Actual:** ClimbScene.tsx (solo) does NOT pass duel prop. ExpeditionHud.tsx conditional {duel && (...)} gates duel instruments. Tests confirm no duel classes render without the prop.
- **Evidence:** ClimbScene.tsx:451-462 (no duel prop). expeditionHudDuel.test.tsx lines 94-110.
- **Result:** PASS

### AC-3: VersusInstrument shows player names + LIVE badge; RaceProgressInstrument shows altitude race bars

- **Method:** Automated tests (11 tests)
- **Expected:** Player names with vs separator, LIVE badge during climb, race bars with percentages, leader marker, (you) marker, slot-specific colors, aria-labels.
- **Actual:** All elements render correctly. LIVE badge appears only during climb phase. Race bar percentages correctly computed (50/50=100%, 30/50=60%). Leader gets triangle marker. Local player gets (you) suffix.
- **Evidence:** expeditionHudDuel.test.tsx lines 116-208.
- **Result:** PASS

### AC-4: opponentStale=true during climb phase shows "opponent reconnecting..."

- **Method:** Automated tests (4 tests)
- **Expected:** "opponent reconnecting" text during climb+stale; hidden when false; hidden outside climb; stale opacity on race bar.
- **Actual:** Guard duel.phase === "climb" && duel.opponentStale && !showReconnecting properly gates. Stale racer bar shows opacity-50/opacity-40 and aria-label includes "connection lost".
- **Evidence:** expeditionHudDuel.test.tsx lines 213-248.
- **Result:** PASS

### AC-5: connectionState disconnected/suspended/connecting shows "reconnecting..."

- **Method:** Automated tests (5 tests)
- **Expected:** Reconnecting for disconnected/suspended/connecting; hidden when connected; own reconnecting suppresses opponent stale.
- **Actual:** All three states trigger reconnecting. Connected does not. Priority logic correct: own reconnecting suppresses opponent stale via !showReconnecting guard.
- **Evidence:** expeditionHudDuel.test.tsx lines 254-285.
- **Result:** PASS

### AC-6: Countdown uses same pattern as solo climb

- **Method:** Structural code comparison
- **Expected:** Same outer/inner wrapper classes, "[ get ready ]" tag, font-display text-7xl numeral.
- **Actual:** Identical class strings. Outer: "absolute inset-0 flex flex-col items-center justify-center overflow-y-auto rounded-xl bg-void/70 backdrop-blur-xs p-4 text-center". Inner: "my-auto flex w-full max-w-sm flex-col items-center py-2". Content matches.
- **Evidence:** DuelRoom.tsx:810-821 vs ClimbScene.tsx:653-656 + 464-472.
- **Result:** PASS

## NFRs

| NFR | Result | Evidence |
|-----|--------|----------|
| NFR-1: No new dependencies | PASS | No new package imports |
| NFR-2: TypeScript strict | PASS | pnpm typecheck clean |
| NFR-3: Quality gates | PASS | typecheck, lint 0 warnings, 688/688 tests |
| NFR-4: Touch targets >= 44x44 | PASS | exp-utility 44x44 min-width/min-height |

## Flow Validation

### F-1: Duel match (critical)
- Discovery via /duel/[id] deep link
- Entry: DuelRoom -> DuelGame with ExpeditionHud + duel prop
- Countdown matches solo pattern (AC-6)
- Climb: shared HUD (AC-1) + duel instruments (AC-3)
- Failure: reconnecting states (AC-4, AC-5)
- Success next: DuelResult (unchanged, out of scope)
- Mid-flow: forfeit beacon (unchanged)

### F-2: Solo climb (regression guard)
- No duel instruments in solo mode (AC-2)
- ClimbScene does not pass duel prop
- No behavioral regression

## Exploratory Checks

- Connection status priority: own reconnecting suppresses opponent stale (verified by test)
- Zero maxAlt boundary: handled without NaN/Infinity (test verified)
- Empty racers array: structure renders without rows (test verified)
- Long player names: CSS truncation via text-overflow: ellipsis with responsive max-widths
- prefers-reduced-motion: animate-pulse uses motion-safe: prefix; existing animations have media query
- "GO" flash uses aria-live="assertive" and aria-atomic="true"

## Non-blocking Notes

1. Countdown aria-live gap (pre-existing): both duel and solo countdown overlays lack aria-live="assertive". Inherited from solo Overlay, not introduced by this change.
2. DuelHudInfo.phase and connectionState typed as string rather than unions (reviewer warning).
3. Player-2 color #6bb8ff hardcoded in 4 locations (reviewer info).

## Quality Gates

| Gate | Result |
|------|--------|
| app-typecheck | PASS |
| app-lint | PASS (0 warnings) |
| app-test | PASS (688/688, 77 files) |

## Applied Learnings

- Reviewer learning 1 (countdown aria-live): Noted as pre-existing gap, not a regression from this change.
- Reviewer learning 2 (connection status priority): Verified the !showReconnecting guard correctly suppresses opponent stale when own connection is down.
- Security reviewer learning (player names): React JSX auto-escapes player names. CSS truncation handles long names.
