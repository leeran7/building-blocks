# Spec: Two-player race (same-map ghost race)

**Product:** The Climb (building-blocks / `app/`)  
**Goal ID:** two-player-race  
**Status:** ready for architect  
**Date:** 2026-09-06  
**Canonical path:** `loop/spec-two-player-race.md` (also mirrored at `loop/spec.md` for this loop)

## Goal

Two people race head-to-head on the **same climb map** (identical seed → identical geometry and power-ups). Ship the **smallest coherent race mode** that still feels like racing someone: an **async ghost race** built on the existing deterministic sim and replay encoding — not generic multiplayer research, not paid-stack competition.

## Locked product decisions (MVP)

| # | Decision | Lock |
|---|----------|------|
| 1 | **Primary mode** | **Async ghost race.** Player A records a run on a seed; Player B opens an invite link and races A’s deterministic ghost on that same seed in one shared `MatchState` (`mode: "multiplayer"`). |
| 1b | Live simultaneous | **Out of scope for MVP.** Live needs durable realtime (WebSocket / party-style infra) beyond current Vercel serverless request/response. **If live is ever unblocked:** reuse this ghost race as the fallback when a live session cannot be established. |
| 2 | **Win condition** | **Race to `RACE_GOAL_M = 100` metres.** First climber whose feet reach ≥ 100 m gets `status: "finished"` and wins (`winnerId`, earliest `finishedTick`, slot tie-break). If **both** are `eliminated` before 100 m → **higher `peakY` wins**; equal `peakY` → **host (slot 0) wins**. |
| 3 | **Same map** | **Confirmed:** one shared `seed`; tower geometry, ladders, obstacles, and power-up spawns are pure functions of `(seed, floorIndex)` — bit-identical for both. |
| 4 | **Lava clock** | **Shared lead-based** hazard already in sim (`climbingLeadM` / catch-up). Both players (ghost + live) occupy one match; one `hazardY` / `hazardSlowSeconds`. Independent per-player lava is out of scope. |
| 5 | **Lobby / invite** | **Invite link only** (shareable URL carrying race payload). No friend codes, no same-browser local couch co-op in MVP. |
| 6 | **Auth** | **Anonymous play allowed** (create challenge + accept challenge), matching free climb. Persisting any race standings / verified win claims requires Firebase auth **and** server re-sim (see fairness). MVP ships **without** a persistent race ladder. |
| 7 | **Fairness / anti-cheat** | Race **does not** write wins into the free solo `peakY` leaderboard. Client shows outcome from local deterministic re-sim. Optional future persist of race results **must** server-re-sim both input logs against the seed and reject mismatches. Solo free-leaderboard trust boundary stays a separate open question (does not block this MVP). |
| 8 | **Out of scope** | Paid stacks / Stripe / burial money game; >2 players; live netcode; couch co-op; ranked race ladder; pay-to-win cosmetics affecting physics; changing solo endless rules. |

### Why ghost race (not live, not phased compare-only)

- Reuses `simulateFromInputs`, `MatchMode.multiplayer` stubs, `runReplay` packing, and `/play?r=` share patterns — no new realtime plane.
- Still **feels** head-to-head: opponent body on the same tower, contested pickups, shared lava, finish line at 100 m.
- Phased “both play then compare peaks” alone is smaller but is a **score duel**, not a race on screen — rejected as primary.
- Live is the aspirational mode; blocked on infra; ghost is the shippable primary and the named fallback.

## Scope

### In scope

1. Race challenge **creation** after a host recording run (seed + input log → invite URL).
2. Race challenge **acceptance** via invite URL → countdown → climb against ghost.
3. Shared-map multiplayer sim: host inputs replayed as ghost player; challenger is live.
4. Win/lose resolution per locked rules (`RACE_GOAL_M`, peak fallback).
5. Discovery from Free climb surfaces (`/play`, post-run overlay) — labels must land on the real race surface.
6. Empty / invalid / expired invite recovery; abandon / refresh mid-race.
7. Results overlay: winner, both peaks, rematch (re-race same ghost) + share outcome link + return to Free climb.
8. Copy that free race is skill/bragging only — separate from paid stacks.

### Out of scope / non-goals

- Live simultaneous netcode, matchmaking, presence, or WebSocket hosts
- Friend codes, lobbies with ready-up for two live clients
- Same-device split-screen / hot-seat
- >2 players or party size >2
- Persistent race ELO / race leaderboard (Future)
- Server-authoritative live tick streaming
- Changing solo endless win rules (solo remains death-ended; never “finishes” at 100 m unless in race mode)
- Paid stacks, Stripe, burial, creator money loops
- Resolving whether free solo `peakY` must be server-derived for the landing leaderboard (Open Question; race path does not worsen it)

### Assumptions

- Deterministic sim remains the source of truth for positions and outcomes.
- Vercel serverless remains the host model for MVP (no always-on game server).
- Existing `?r=` replay share can inspire encoding; race invite is a **distinct** payload/mode (do not overload solo replay UX as “you are racing”).
- Design system stays ASCENT (`app/DESIGN.md`); race chrome uses climb tokens, not a second brand.

### Constraints

- Trust: client-submitted scores remain a hard boundary (`context/trust.md`). Race must not add a new irreversible win write without server re-sim.
- Do not mix free-race prestige into paid-stack ranking or payouts.
- Nav/CTA honesty: a control named for racing must open the race flow, not a teaser.

## Flows

### F-1 — Discover & enter Race (from Free climb)

- **critical:** yes
- **Persona / trigger:** Alex finishes a free climb or opens `/play` wanting to challenge a friend.
- **Discovery:** Post-run Free climb overlay primary secondary action **“Race a friend”**; optional short link from Free climb play chrome (not paid-stack nav). Landing `#free` may mention racing only with a link to the playable race entry — never a dead teaser.
- **Entry:** `/play` race-create path (exact route left to architect; must be a playable surface).
- **Preconditions:** None (anonymous OK).
- **One job:** Start the host recording that will become a challenge.
- **Happy path:** Open Race → see brief rules (same map, race to 100 m, ghost) → **Start recording** → countdown → climb.
- **Empty / first-run:** First visit shows rules + single primary CTA **Start recording**; no prior challenges list required for MVP.
- **Failure:** If seed/init fails, show retry; do not leave a blank canvas.
- **Success next:** On host run end → F-2 create invite.
- **Mid-flow interrupt:** Refresh during recording aborts the open challenge; user returns to Race entry with Start recording. Double-start ignored while countdown/climb active.
- **Utilization:** Primary path = Free climb result → **Race a friend** → record → share. Do not bury behind settings.

### F-2 — Host records run & shares invite

- **critical:** yes
- **Persona / trigger:** Alex recording for a challenge (from F-1).
- **Discovery / entry:** Continuation of F-1 after Start recording.
- **Preconditions:** Active race-recording session with a fresh shared `seed`.
- **One job:** Produce a shareable invite that freezes seed + host inputs.
- **Happy path:** Host climbs until they reach 100 m **or** die → results for recording → **Copy invite link** / system share → confirmation that link is ready → optional “I copied it — done”.
- **Empty:** N/A (recording always produces a seed); if input log empty (instant quit), refuse invite encode and prompt **Record again**.
- **Failure:** Encode/share failure → visible error + retry encode; keep seed/inputs in session until success or discard.
- **Success next:** Instruct to send link to friend; CTA **Race again (new seed)** or **Back to Free climb**.
- **Mid-flow interrupt:** Refresh after finish but before copy → if session can restore recording payload, re-show share; else “recording lost, record again”. Double-tap Copy is idempotent.
- **Utilization:** One clear **Copy invite link** after recording; advanced options later.

### F-3 — Challenger opens invite & races ghost

- **critical:** yes
- **Persona / trigger:** Jordan opens invite URL from Alex.
- **Discovery:** Deep link only for MVP (no public match browser).
- **Entry:** Race accept route/query (distinct from solo `?r=` replay).
- **Preconditions:** Valid invite payload (version, seed, host input log, host peak, goal metres).
- **One job:** Race the ghost on the same map and get a winner.
- **Happy path:** Land on race surface → see “Racing [Host] · same map · first to 100 m” → **Start race** → countdown → climb with ghost + shared lava → finish/eliminated → results (winner, peaks, ticks).
- **Empty / first-run:** Invalid/missing payload → explain + CTA **Free climb** / **Create your own race** (F-1). Do not start solo replay by accident.
- **Failure:** Corrupt/too-long token → same recovery as empty. Sim desync (should not happen if deterministic) → show failure + offer Free climb.
- **Success next:** Rematch same ghost / Create own race / Free climb / Share outcome.
- **Mid-flow interrupt:** Refresh mid-climb abandons in-progress race; reopening invite restarts from countdown (host ghost unchanged). Back-navigation confirms abandon. Double Start ignored while climbing.
- **Utilization:** Deep link → Start race is the only primary path.

### F-4 — Results, rematch, outcome share

- **critical:** yes
- **Persona / trigger:** Either player after a resolved race (challenger always; host sees recording summary in F-2).
- **Discovery / entry:** Automatic overlay when `phase` is finished/results.
- **Preconditions:** Match resolved per win rules.
- **One job:** Understand who won and choose next action.
- **Happy path:** Show Winner / peaks / whether finish was goal vs peak-fallback → **Rematch** (same invite) → **Create your own race** → **Free climb**.
- **Empty:** N/A when match resolved; if winner undecidable (bug), show error + Free climb (negative path).
- **Failure:** Share-outcome encode fail → still show local results; retry share.
- **Success next:** Rematch or create own race (loop utilization).
- **Mid-flow interrupt:** Dismiss overlay returns to race entry for that invite; does not erase ability to rematch from the invite URL.
- **Utilization:** Rematch same ghost is the default next competitive action.

### F-5 — Unauthorized / trust-boundary (race persist)

- **critical:** yes (trust-adjacent; even though MVP persist is off, the boundary must be testable)
- **Trigger:** Any client attempts to POST a “race win” or mutate free solo leaderboard using race fields.
- **Happy path (MVP):** No race-win persist API is exposed; free climb `POST /api/climb/result` remains solo-only and does not accept race victory claims.
- **Negative:** Unauthenticated or authenticated POST that tries to record a race win is rejected (404/400/403 as architect chooses) and does not change `peakY` records.
- **Empty:** N/A
- **Mid-flow:** N/A — API has no multi-step client flow in MVP.
- **Utilization:** Brag via invite/outcome links; prestige ladder stays Future + server re-sim.

## Personas

1. **Alex (Host)** — Plays Free climb for skill/bragging; wants to prove a line on a map to a friend. Starts F-1 → F-2.
2. **Jordan (Challenger)** — Receives a link; wants a fair same-map duel without creating an account. Starts F-3 → F-4.
3. **Sam (Spectator-adjacent)** — Optional light persona: opens an outcome/share link later (Future if distinct); for MVP may use rematch link as challenger. No separate critical flow.

## Stories

### US-1 (F-1) — Enter race mode
As Alex, I want a clear **Race a friend** entry from Free climb, so that I can start a same-map challenge without hunting menus.  
- Happy: CTA opens race rules + Start recording.  
- Failure: CTA missing or routes to landing teaser only → fail AC.

### US-2 (F-2) — Record & invite
As Alex, I want to record one climb and copy an invite link, so that Jordan gets my exact map and ghost.  
- Happy: After run, Copy invite link yields URL Jordan can open.  
- Failure: Empty input log cannot produce a link; user prompted to record again.

### US-3 (F-3) — Race the ghost
As Jordan, I want to climb against Alex’s ghost on the same seed with shared lava, so that it feels like a head-to-head race.  
- Happy: Ghost replays; I control live climber; match resolves by 100 m or peak fallback.  
- Failure: Invalid link shows recovery CTAs, not a crash or silent solo play.

### US-4 (F-4) — See winner & rematch
As Jordan, I want an unambiguous winner and rematch, so that we can immediately run it back.  
- Happy: Winner id/label + both peaks; Rematch restarts countdown on same invite.  
- Failure: Share outcome fails but results remain visible.

### US-5 (F-5) — No fake competitive writes
As the product, I want race outcomes not to poison the free solo leaderboard, so that competitive claims stay honest.  
- Happy: Completing a race does not call solo result persist with a race victory flag.  
- Failure: Forged POST cannot raise leaderboard via race payload.

## Acceptance criteria

### AC-1 (F-1 happy) — Race entry is playable
**Given** I am on Free climb `/play` (or post-run overlay)  
**When** I activate **Race a friend**  
**Then** I land on a race-create surface that shows the 100 m rule and a **Start recording** control (not `#free` teaser-only).

### AC-2 (F-1 empty/first-run) — First visit guided
**Given** I have never raced  
**When** I open the race-create surface  
**Then** I see rules copy including “same map”, “ghost”, and “first to 100 m” and exactly one primary CTA **Start recording**.

### AC-3 (F-1 negative) — Init failure recoverable
**Given** race recording fails to initialize (seed/sim error)  
**When** the error is shown  
**Then** a **Retry** control returns me to a state where Start recording is available again.

### AC-4 (F-1 mid-flow) — Refresh aborts open recording
**Given** I am mid-recording climb  
**When** I refresh the page  
**Then** the in-progress recording is discarded and I must Start recording again (no half-written invite).

### AC-5 (F-2 happy) — Invite encodes same seed + inputs
**Given** I completed a recording with ≥1 input tick  
**When** I copy the invite link  
**Then** the link payload includes a version, the recording `seed`, the host input log, host `peakY`, and `RACE_GOAL_M = 100`, and decoding yields those values.

### AC-6 (F-2 empty) — Empty log cannot invite
**Given** a recording ended with an empty input log  
**When** I try to create an invite  
**Then** no link is produced and UI prompts **Record again**.

### AC-7 (F-2 negative) — Encode failure
**Given** invite encoding fails (budget/size)  
**When** I tap Copy invite link  
**Then** I see a failure message and can retry or record a shorter run; solo `?r=` replay is not silently substituted.

### AC-8 (F-2 mid-flow) — Double Copy idempotent
**Given** a valid finished recording in session  
**When** I activate Copy invite link twice  
**Then** both attempts yield a functionally equivalent invite (same seed + inputs); no second recording starts.

### AC-9 (F-3 happy) — Same map + ghost race
**Given** a valid invite from AC-5  
**When** I Start race  
**Then** the match uses `mode: "multiplayer"`, the invite `seed`, two players (ghost + me), ghost inputs follow the log tick-for-tick, and tower geometry/power-ups match a solo createMatch with that seed.

### AC-10 (F-3) — Shared lava
**Given** a race in progress with ghost and live climber  
**When** either climber leads beyond catch-up threshold or picks slow-lava  
**Then** there is a single shared `hazardY` timeline (not two independent lava clocks).

### AC-11 (F-3) — Win by reaching 100 m
**Given** a race where the live climber’s feet reach ≥ 100 m while ghost has not finished  
**When** the tick resolves  
**Then** live climber `status` is `finished`, `winnerId` is the live climber, and phase becomes `finished`/`results`.

### AC-12 (F-3) — Win by peak when both die early
**Given** host peak was 42 m and live climber is eliminated at peak 55 m, both below 100 m  
**When** the match resolves  
**Then** live climber is the winner.  
**Given** live peak 40 m vs host 42 m, both eliminated below 100 m  
**When** the match resolves  
**Then** host (ghost, slot 0) is the winner.

### AC-13 (F-3 empty/invalid) — Bad invite recovery
**Given** a missing, truncated, or wrong-version invite token  
**When** I open the race accept URL  
**Then** I see an invalid-invite message and CTAs to **Free climb** and **Create your own race**, and the solo replay player does not auto-start.

### AC-14 (F-3 negative) — Do not treat race URL as solo replay
**Given** a well-formed **race** invite URL  
**When** it is opened  
**Then** the UI labels the session as a race against a ghost (not “Replay”), and controls are live play + rematch, not replay transport-only.

### AC-15 (F-3 mid-flow) — Refresh restarts challenge, does not mutate invite
**Given** I am mid-race on an invite  
**When** I refresh and Start race again  
**Then** I get a fresh countdown against the **same** host ghost/seed; host payload is unchanged.

### AC-16 (F-4 happy) — Results + rematch
**Given** a resolved race  
**When** results show  
**Then** winner label, both peaks (1 decimal m or existing unit formatting), and whether win was `goal` vs `peak` are visible, and **Rematch** restarts F-3 happy path on the same invite.

### AC-17 (F-4 negative) — Outcome share failure non-destructive
**Given** results are visible and outcome-share encoding fails  
**When** share fails  
**Then** results remain on screen and a retry is offered.

### AC-18 (F-5 trust) — Race does not write free solo leaderboard wins
**Given** a completed ghost race (win or loss)  
**When** the client finishes the race flow  
**Then** it does not persist a race victory into free solo `peakY` / `topFreeClimbers`. Any dedicated race-result POST (if present) rejects unauthenticated clients and does not call `recordClimb` with a client-authored winner without server re-sim.

### AC-19 (F-5 unauthorized) — Forged race win rejected
**Given** an unauthenticated request that claims `raceWin: true` (or equivalent) against climb result APIs  
**When** the server handles it  
**Then** the response is an error status, and no climber row’s stored peak increases due to that request.

### AC-20 (Cross-cutting) — Paid stacks untouched
**Given** any race flow  
**When** completed  
**Then** no Stripe checkout, burial, or paid-stack rank mutation occurs.

### AC-21 (Cross-cutting) — Solo endless unchanged
**Given** a normal Free climb solo session (not race)  
**When** I play  
**Then** there is still no 100 m auto-finish; runs end only on lava/fall elimination as today.

## NFRs

| ID | Requirement | Measure |
|----|-------------|---------|
| NFR-1 | Invite decode + first paint of race accept chrome | ≤ 2 s on broadband after document load (payload decode CPU bound; max token size documented by architect ≤ current replay budget unless justified) |
| NFR-2 | Sim tick rate | Remains 30 Hz (`TICK_HZ`); race mode must not drop to variable timestep |
| NFR-3 | Auth | Anonymous race create/accept allowed; any future persist gated on Firebase `requireAuth` in route handlers (middleware presence-only) |
| NFR-4 | A11y | WCAG 2.1 AA for new race chrome; controls ≥ 44×44 CSS px; winner announced via `aria-live` with monotonic counter on repeat rematches |
| NFR-5 | Scale envelope | MVP is link-based 1v1; no matchmaking QPS target. Invite payload must enforce a max tick count (reuse or mirror `MAX_SHARE_TICKS` unless architect documents a race-specific cap) |
| NFR-6 | Determinism | Same seed + both input logs → identical `winnerId` / peaks on two clients (bit-identical match fields used for outcome) |
| NFR-7 | Separation | Race UI copy states no stakes / not paid stacks |

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Live expected by users | Disappointment | Copy says “race their ghost on the same map”; Future live listed |
| Contested pickups feel unfair if ghost snipes orbs | Perceived unfairness | Accept as authentic same-match racing; document in rules |
| Host slow-lava banks shared hazard | Balance swings | Keep shared clock (locked); tune later if needed |
| Invite URL size | Encode failures on long runs | Cap ticks; prompt shorter recording (AC-7) |
| Trust boundary confusion with solo LB | Fake prestige | AC-18/19; do not write race wins to solo LB |
| `resolveOutcome` today ignores peak fallback | Wrong winner when both die | Architect must extend race outcome rules; verifier tests AC-12 |
| Nav teaser honesty regression | Dead-end CTAs | AC-1; qa walks F-1 entry |

## Open Questions

1. **Solo free leaderboard trust boundary (pre-existing):** Still OPEN whether landing `topFreeClimbers` requires server-derived `peakY`. **This MVP does not close it**; race mode explicitly avoids adding race wins to that board.
2. **Host display name on invite:** Show “Host” vs optional typed name vs auth displayName when signed in? Default MVP: **“Host”** / “Friend’s ghost” if anonymous; auth name when available — architect may pick one without blocking.
3. **Exact URL shape** (`/play?race=` vs `/race?c=`): left to architect; must remain distinct from `?r=` replay.

## Future

- Live simultaneous 1v1 with realtime infra; on failure, fall back to this ghost race
- Persistent race ladder with mandatory server re-sim of both logs
- Friend codes / presence lobby
- Couch co-op same browser
- 3–4 player ghost ghost-party
- Phased async compare as a **secondary** mode (peak duel without on-screen ghost)
- Closing solo free LB with AC-17-style re-sim

## Edge cases

- Ghost finishes 100 m before live player → ghost wins immediately; live can spectate until overlay or stop inputs.
- Ghost eliminated; live still climbing → live may still win via 100 m or higher peak if they later die.
- Challenger closes tab after win → rematch via same link still works.
- Host records past `MAX_SHARE_TICKS` → refuse invite; ask to retry with earlier death or accept architect’s race cap messaging.
- Power-up collected by ghost is gone for live player (contested) — intended.
- Solo replay `?r=` links continue to work unchanged (AC-21 adjacent).
