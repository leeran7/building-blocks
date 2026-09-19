# Spec: Unify Duel Game UI with Free Climb / Daily Pattern

**Product:** The Climb (building-blocks)
**Goal ID:** duel-ui-unification
**Date:** 2026-09-19

## Goal

Refactor the 1v1 duel game UI to share the same visual structure as Free
Climb / Daily (ClimbScene + ExpeditionHud), while preserving all duel-specific
information (opponent name, altitude comparison, connection status, LIVE
badge). DuelResult and useRace stay as-is.

## Scope

### In scope

- Extend ExpeditionHud to accept optional duel-specific instruments
  (opponent info, altitude race bars, connection status, LIVE badge).
- Refactor DuelGame to use ExpeditionHud instead of the bespoke versus HUD.
- Use the same countdown overlay component as ClimbScene in duel mode.
- Clean up the old bespoke duel HUD code from DuelRoom.tsx.

### Out of scope

- Changes to DuelResult component or useRace hook.
- Changes to PracticeGame lobby (pre-game warm-up).
- Changes to game simulation, networking, or scoring.
- ClimbScene internal refactoring (it already handles solo well).
- New game modes or features.

### Assumptions

- useRace and useClimb produce compatible MatchState that ClimbCanvas renders.
- ExpeditionHud CSS grid can accommodate additional instruments via
  conditional rendering without breaking existing solo layout.

### Constraints

- No new dependencies.
- Preserve all existing duel information visibility.
- Match existing design tokens (DESIGN.md, tailwind.config.ts).

## Flows

### F-1: Duel match (critical: yes)

- **Who:** A player who has joined a 1v1 duel.
- **Trigger:** Both players present in room, "start" event received.
- **Discovery:** /duel/[id] deep link or invite.
- **Entry:** DuelRoom -> DuelGame component.
- **Preconditions:** Both players connected, duel seed received.
- **Steps:**
  1. Countdown overlay (3-2-1) uses same component as solo climb.
  2. "GO" flash on climb start with LIVE badge in ExpeditionHud.
  3. During climb: ExpeditionHud shows height, lava clearance, active powers
     (same as solo), PLUS opponent name/vs display, altitude race bars,
     connection status, LIVE badge (duel-specific instruments).
  4. On finish: DuelResult renders (unchanged).
- **Empty/first-run:** N/A (duel always has two players).
- **Failure:** Connection loss shows "reconnecting..." in HUD. Opponent
  disconnection shows "opponent reconnecting..." status.
- **Success next:** DuelResult with rematch/share options (unchanged).
- **Mid-flow interrupt:** Tab close triggers forfeit beacon (unchanged).
- **Utilization:** Shared HUD makes duel feel like a natural extension of
  solo climb, not a separate product.

### F-2: Solo climb (critical: yes, regression guard)

- **Who:** A player doing free climb or daily climb.
- **Trigger:** User clicks "Start climb" on /play or /daily.
- **Steps:** Unchanged - ClimbScene with ExpeditionHud.
- **Verification:** No visual or behavioral regression.
- **Empty/first-run:** N/A (existing flows unchanged).
- **Failure:** N/A (existing error handling unchanged).

## Personas

1. **Climber (solo)** - plays free climb / daily, expects consistent UI.
2. **Duelist** - plays 1v1, needs opponent info alongside climb data.

## Stories

### S-1: Shared HUD (F-1, F-2)

As a duelist, I want the duel game HUD to match the solo climb HUD, so the
game feels cohesive regardless of mode.

- Happy: Duel shows ExpeditionHud with height, lava clearance, utilities.
- Failure: Solo climb regresses visually.

**AC-1:** Given a duel match in progress, when ExpeditionHud renders, then
height instrument, lava clearance instrument, and utility controls display
identically to solo climb.

**AC-2:** Given a solo climb, when ExpeditionHud renders, then no duel-
specific instruments are visible (no vs display, no race bars, no LIVE badge).

### S-2: Duel-specific HUD instruments (F-1)

As a duelist, I want to see opponent name, altitude comparison, connection
status, and LIVE badge, so I know how the race is going.

- Happy: HUD shows vs display, race bars, LIVE badge, connection status.
- Failure: Duel information hidden or unreadable.

**AC-3:** Given a duel match in progress, when ExpeditionHud renders with
duel props, then it shows: opponent vs display (both player names), altitude
race bars for both players with relative progress, and LIVE badge during
climb phase.

**AC-4:** Given a duel with stale opponent snapshots, when ExpeditionHud
renders, then "opponent reconnecting..." appears in the HUD.

**AC-5:** Given a duel with own connection issues, when ExpeditionHud
renders, then "reconnecting..." appears in the HUD.

### S-3: Countdown consistency (F-1)

As a duelist, I want the countdown to look the same as solo climb, so the
game start feels consistent across modes.

- Happy: Duel countdown uses same Overlay component and styling.
- Failure: Countdown looks different between modes.

**AC-6:** Given a duel countdown starts, then the overlay matches solo climb
in structure (centered overlay, "get ready" tag, large numeral, same font
classes).

## NFRs

- NFR-1: No new runtime dependencies added.
- NFR-2: TypeScript strict mode passes (no any).
- NFR-3: Existing quality gates pass (lint, typecheck, test).
- NFR-4: Touch targets >= 44x44 CSS px for all HUD controls.

## Risks

- R-1: CSS grid changes in ExpeditionHud could break solo layout. Mitigated
  by conditional rendering (duel instruments only mount when props provided).
- R-2: Responsive behavior on touch devices. Mitigated by using same
  breakpoints and safe-area handling.

## Open Questions

None.

## Future

- Shared spectator mode using unified stage.
- Group race (3-4 players) extending same HUD pattern.
