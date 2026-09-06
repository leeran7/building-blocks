# Architecture (active goal)

**Goal:** two-player-race (async ghost MVP)  
**Canonical design:** [`loop/architecture-two-player-race.md`](./architecture-two-player-race.md)  
**Spec:** [`loop/spec-two-player-race.md`](./spec-two-player-race.md)  
**Prior:** replay-transport / native-share / climb-feel architectures remain historical under `architecture.md` git history and `architecture-*.md` siblings.

## Key contracts (summary)

| Contract | Lock |
| --- | --- |
| Mode | Async ghost on `MatchState.mode = "multiplayer"`; no WebSockets |
| Goal | `RACE_GOAL_M = 100` (sim `y`); else higher `peakY`; tie → slot 0 host |
| Invite | `/play/race?c=<token>` — wire `{ v:1, t:"race", s, p, g:100, i }` |
| Solo replay | `/play?r=` unchanged; reject race tokens in `decodeRunReplay` |
| Persist | **No** race writes; `POST /api/climb/result` solo-only + reject `raceWin*` |
| Sim | `goalM` on match; finish-at-goal in `stepMatch`; peak fallback only if `mode === "multiplayer"` |
| nextStage | **implementer** (ASCENT exists; design-ux not required first) |

Read the canonical file for AC→module map, Mermaid trust boundaries, folder ownership, ADRs, and implementer checklist.
