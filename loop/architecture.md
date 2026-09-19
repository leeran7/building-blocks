# Architecture: Unify Duel Game UI with Free Climb / Daily Pattern

**Goal ID:** duel-ui-unification
**Spec:** loop/spec.md (AC-1 through AC-6)
**Stack:** existing Next.js App Router + React + canvas sim in app/
**Date:** 2026-09-19

## 1. AC -> architectural need

| ACs | Need |
| --- | --- |
| AC-1, AC-2 | ExpeditionHud renders solo instruments by default; duel instruments only when optional duel props provided |
| AC-3, AC-4, AC-5 | New duel HUD instruments: VersusBar (names), RaceProgress (altitude bars), DuelStatus (LIVE badge + connection) |
| AC-6 | DuelGame uses same Overlay + countdown component as ClimbScene |

## 2. Stack choice

| Choose | Rationale |
| --- | --- |
| Extend ExpeditionHud with optional props | Single component, conditional rendering; no parallel copy |
| New CSS in expedition.css | Stays in existing style system; container queries already handle responsive |
| Same Overlay component pattern in DuelGame | Function from ClimbScene can be shared or duplicated (it's 6 lines) |

**Not choosing:** Creating a shared ClimbStage wrapper (too much churn for 
the actual differences); making ClimbScene accept useRace output (ClimbScene 
has too much solo-specific logic like score posting, replays, share URLs).

## 3. Component changes

### ExpeditionHud (extended)

New optional props for duel mode:

```ts
interface DuelHudProps {
  /** Duel race info. When provided, duel instruments render. */
  duel?: {
    player1Name: string;
    player2Name: string;
    racers: Array<{
      slot: number;
      name: string;
      y: number;
      isMe: boolean;
      isLeader: boolean;
      stale: boolean;
    }>;
    maxAlt: number;
    phase: string;
    connectionState: string;
    opponentStale: boolean;
    liveBeat: boolean;
  };
}
```

### DuelGame (refactored)

Replaces bespoke versus HUD with:
1. ExpeditionHud (with duel props) for the instrument overlay
2. Same Overlay component for countdown
3. Same "joinBeat" and "liveBeat" overlays (kept as-is)

### New sub-components in ExpeditionHud

- VersusInstrument: player names "vs" display with LIVE badge and connection status
- RaceProgressInstrument: altitude race bars for all players

These render inside the exp-hud grid only when duel props are provided.

## 4. Data flow

```
DuelRoom
  -> DuelGame
       -> useRace (unchanged)
       -> ClimbCanvas (unchanged) 
       -> ExpeditionHud (extended with duel props)
            -> HeightInstrument (existing)
            -> LavaClearanceInstrument (existing)
            -> VersusInstrument (new, conditional)
            -> RaceProgressInstrument (new, conditional)
            -> UtilityControls (existing)
            -> ActivePowerStack (existing)
       -> Overlay (shared pattern for countdown)
       -> TouchControls (unchanged)
```

## 5. CSS grid layout changes

The exp-hud grid currently uses:
- Default: `grid-template-columns: minmax(0,1fr) minmax(0,1fr) 44px`
- Wide (>=620px): `grid-template-columns: minmax(145px,1fr) minmax(210px,1.5fr) minmax(155px,1fr) 44px`

For duel mode, add a new row below the existing grid for the duel-specific 
instruments (versus bar + race progress). These sit below the main HUD 
instruments as a full-width strip, avoiding any disruption to the solo layout.

## 6. File changes

| File | Change |
| --- | --- |
| app/src/components/Game/ExpeditionHud.tsx | Add optional duel props; render VersusInstrument + RaceProgressInstrument conditionally |
| app/src/components/Game/expedition.css | Add styles for .exp-versus and .exp-race-progress |
| app/src/components/Duel/DuelRoom.tsx | DuelGame: replace bespoke HUD with ExpeditionHud, use Overlay for countdown |

## 7. ADRs

### ADR-1: Extend ExpeditionHud rather than wrap or fork

**Decision:** Add optional duel props to ExpeditionHud.
**Alternatives:** (a) Fork ExpeditionHud for duel -- violates DRY, double maintenance. (b) Create shared wrapper -- too much indirection for the actual delta.
**Consequence:** ExpeditionHud has a wider interface but conditional rendering keeps solo path clean.

### ADR-2: Keep DuelGame as a separate component (don't merge into ClimbScene)

**Decision:** DuelGame stays separate from ClimbScene.
**Reason:** ClimbScene has ~300 lines of solo-specific logic (score posting, replay encoding, share URLs, pending climb storage, daily finish callbacks). Merging would create a sprawling component with mode branching everywhere. The visual unification comes from sharing ExpeditionHud and the Overlay pattern, not from sharing the orchestrating component.
**Consequence:** DuelGame independently composes ClimbCanvas + ExpeditionHud + overlays. Two components that look the same but have different lifecycle logic.

### ADR-3: Duel instruments as a sub-row, not additional grid columns

**Decision:** Duel instruments render as a full-width row below the main HUD instruments.
**Reason:** Adding columns to the existing grid would require restyling all breakpoints. A separate row below is additive and doesn't change solo layout at all.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| CSS grid changes break solo | Duel instruments are a separate grid row with conditional mount; solo never renders them (AC-2) |
| Touch safe-area misalignment | Reuse same safe-area calculation as solo (already identical in DuelGame) |
| Power-up stack collision with duel row | Position duel row after powers in DOM order; test on narrow viewports |

## 9. Test seams

| AC | Verify by |
| --- | --- |
| AC-1 | Mount ExpeditionHud with duel props; verify height + lava clearance instruments render |
| AC-2 | Mount ExpeditionHud without duel props; verify no .exp-versus or .exp-race-progress |
| AC-3 | Mount with duel props; verify versus names, race bars, LIVE badge render |
| AC-4 | Mount with duel.opponentStale=true; verify reconnecting text |
| AC-5 | Mount with duel.connectionState="disconnected"; verify reconnecting text |
| AC-6 | Visual: duel countdown uses same Overlay structure and classes |
