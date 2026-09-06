# PRD: Climb Feel 1.2× (Identity Amplification Pass)

_Status: draft for architect · Goal iteration 1 · 2026-09-06_

## Goal

Amplify **The Climb** identity, intensity, motion, and presence by approximately **20% (1.2×)** across climb-facing surfaces so the free climb feels more present, urgent, and on-brand — without rewriting game physics, anti-cheat score bounds, the ASCENT design system, or paid-stack funnels.

This is a **feel / presentation pass**, not a rebrand and not a balance patch.

---

## Scope

### In scope

Climb-facing surfaces and shared ASCENT atmosphere that those surfaces already use:

| Surface | Paths / components (indicative) |
| --- | --- |
| Play / live climb | `/play`, `ClimbScene`, `ClimbCanvas`, `PowerUpHud`, climb VFX (`powerUpVfx`), climb atmosphere (`climbBackground`) |
| Free climb leaderboard | `/climb`, `ClimbLeaderboard`, `ClimbPanelIntro`, `FreeStackShell` |
| Landing / marketing climb cues | `LandingPage/Hero` free tier + play CTA, `LandingPage/FreeLeaderboard`, climb-related footer links |
| Dashboard free climb | `FreeClimbCard`, `FreeClimbEmpty`, climb replays entry points that already pitch free climb |
| Shared climb chrome | Navbar “Free climb” context, `globals.css` atmosphere (`.grain`, `.topo`, `.survey-grid`, `.ground-gradient`, `.altimeter`, `.reveal`), climb-related Tailwind motion tokens (`enter`, `climb`, `groundRise`, `powerUpEnter`, `powerUpUrgent`) |

Allowed change classes (each must land as a measurable delta vs current baseline — see ACs):

1. **Typography emphasis** on climb titles, altitude readouts, and free-climb ranks (~1.2× relative size within DESIGN.md scale).
2. **Motion intensity** — travel distance and/or duration of climb UI animations (~1.2× punchier: ~20% larger travel and/or ~17% shorter duration), always gated by `prefers-reduced-motion`.
3. **HUD / instrument emphasis** — altitude + lava readouts, threat cues, pickup feedback amplitude (visual only).
4. **Atmosphere** — grain / topo / ember / altimeter presence on climb shells (opacity / coverage within caps).
5. **Microcopy** — center the word **climb** (and “free climb” where already used) on climb CTAs and empty/error states; no new duplicate pitches that violate DESIGN.md CTA rules.
6. **Brand presence** — signal/ember duotone and instrument motifs read stronger on climb surfaces without inventing new tokens.

### Out of scope

- Paid-stack checkout, Stripe flows, altitude purchase UX, `/stack/*` paid leaderboard redesign.
- Admin social (`/admin/social/*`).
- Unrelated towers / category wayfinding rainbow / paid tower accents.
- Changing **`RAPID_CLIMB_MULT`**, jetpack thrust/fuel, lava speed, archetype climb speeds, `scoreBounds` / `MAX_ASCENT_SPEED_MPS`, anti-cheat thresholds, or any formula that alters legal score envelopes.
- Server re-simulation of free-climb peaks / AC-17 trust-boundary work (see Open Questions — deferred, not closed).
- Full rebrand, new color tokens outside ASCENT, new typefaces.
- New primary CTAs that duplicate an existing destination pitch (DESIGN.md “one pitch per destination”).
- Audio redesign beyond what is required to keep mute / reduced-motion parity (no new mandatory sound).
- Physics “feels faster” via sim tick rate, gravity, or climb speed multipliers.

### Assumptions

- A1. Current ASCENT tokens in `app/DESIGN.md` + `app/tailwind.config.ts` + `app/app/globals.css` remain the single source of truth; amplification is relative to **today’s authored values**, not a second palette.
- A2. “1.2×” means a **presentation multiplier** applied to listed visual/motion metrics; simulation state and persisted `peakY` legality stay byte-identical for the same inputs.
- A3. Climb-facing = free climb play, free leaderboard, and marketing/dashboard surfaces that already promote free climb — not the paid arena hero primary path.
- A4. Design-ux may refine token mapping after this spec; architect still owns component/file impact map and non-goals for physics.

### Constraints

- C1. WCAG 2.1 AA for all text/UI chrome touched by this pass (body/UI ≥ 4.5:1 on void/surface; large text ≥ 3:1). Do not promote `text-muted` (`#74707e`) onto body copy (ledger: Spec quality).
- C2. Every new or tuned animation must no-op or substitute a static/crossfade under `prefers-reduced-motion: reduce`.
- C3. Touch targets remain ≥ 44×44 CSS px for interactive controls.
- C4. Do not invent tokens; only adjust magnitudes of existing utilities/constants within caps in NFRs.
- C5. Canvas/HUD changes must not reintroduce per-frame React state publishing or unconditional `canvas.width` assignment (ledger: Performance).
- C6. CTA rule: extend or neutralize existing climb pitches; do not add a second “Play the climb” on a surface that already has one primary climb CTA.

---

## Personas

### P1 — Guest climber
- **Context:** Lands from marketing or a shared replay; may play without an account.
- **Goal:** Feel the intensity of the climb immediately — height, hazard, and brand — then decide to try a run.
- **Success:** Play surface feels urgent and “climb-first”; reduced-motion still playable.

### P2 — Ranked free climber
- **Context:** Signed-in player with a saved peak; checks `/climb` and dashboard free-climb card.
- **Goal:** See their climb identity (rank, peak, climb language) with stronger presence than before.
- **Success:** Leaderboard and dashboard free-climb modules read as the same ASCENT instrument family as play.

### P3 — Accessibility-sensitive climber
- **Context:** Uses reduced motion and/or relies on contrast and screen-reader announcements.
- **Goal:** Get the amplified identity without motion sickness, illegible chrome, or silent repeated live-region updates.
- **Success:** All amplified motion collapses cleanly; HUD/contrast stays AA; announcements remain reliable.

---

## Stories

### S1 — Amplify the live climb stage
**As a** guest climber (P1),  
**I want** the play scene’s HUD, atmosphere, and pickup feedback to feel ~20% more intense,  
**so that** every run reads as The Climb rather than a generic endless game.

- **Happy path:** Start a run on `/play`; altitude/lava HUD, ember/topo atmosphere, and pickup VFX read stronger; climb still controllable.
- **Failure case:** Amplification makes HUD unreadable, shakes excessively under reduced motion, or changes sim outcomes for the same input log.

### S2 — Amplify climb marketing presence (without stealing paid primary)
**As a** guest climber (P1),  
**I want** the landing free-climb cue and free leaderboard module to center climb identity more clearly,  
**so that** I can start a free climb without the page becoming a second paid rebrand.

- **Happy path:** On `/`, free-climb stats/CTA and free leaderboard section show stronger climb language + atmosphere; paid primary CTA remains the hero’s primary action.
- **Failure case:** A duplicate “Play the climb” pitch appears beside an existing free-climb CTA, or paid primary is visually demoted below free climb.

### S3 — Amplify free leaderboard + dashboard climb identity
**As a** ranked free climber (P2),  
**I want** `/climb` and the dashboard free-climb card to use stronger climb typography, instrument motifs, and climb-centered copy,  
**so that** my rank feels like part of The Climb, not a muted sidebar.

- **Happy path:** Titles/ranks scale up ~1.2× within DESIGN.md; topo/grain/altimeter/survey motifs present; empty and error states still distinct.
- **Failure case:** Unavailable standings render as “no climbers yet”, or empty state loses climb language.

### S4 — Preserve a11y and reduced motion under amplification
**As an** accessibility-sensitive climber (P3),  
**I want** amplified motion and atmosphere to respect reduced-motion and contrast rules,  
**so that** the 1.2× pass does not regress WCAG AA or vestibular safety.

- **Happy path:** With `prefers-reduced-motion: reduce`, climb UI animations disable; HUD contrast stays AA; controls remain ≥ 44×44.
- **Failure case:** Shake/shimmer/groundRise continue under reduced motion, or altitude labels drop below AA contrast.

### S5 — Freeze physics and score trust for this pass
**As a** ranked free climber (P2),  
**I want** the same inputs to produce the same peak legality as before this pass,  
**so that** a feel upgrade cannot be used (or mistaken) as a score exploit.

- **Happy path:** `RAPID_CLIMB_MULT`, score-bound constants, and anti-cheat height deltas are unchanged; visual-only constants may move.
- **Failure case:** Any PR changes climb speed multipliers or persist-path envelopes “to make it feel faster.”

---

## Acceptance criteria

Baselines are the values in the repo **before this pass** (record them in architecture / implementation notes). Unless noted, “1.2×” means target = baseline × 1.2, with allowed band **1.15×–1.25×**. Caps in NFRs override the band when they would be exceeded.

### S1 — Live climb stage

**AC-1.** Given the climb canvas HUD altitude readout font size constant (baseline `13` UI units in `ClimbCanvas`), when the 1.2× pass ships, then that constant is within **15–16** (inclusive) and lava/hazard secondary text remains at least the same UI size as altitude or uses `TEXT_SECONDARY` / `#a8a4b2` (not `TEXT_MUTED` / `#74707e`) on the void/surface HUD fill.

**AC-2.** Given pickup camera-shake amplitude baseline (`2.2 * ui` in `pickupShakeOffset`), when the pass ships, then shake amplitude is within **2.53–2.75** × `ui` (≈1.15–1.25×), and Given `reducedMotion === true`, When a pickup occurs, Then `pickupShakeOffset` returns `{ dx: 0, dy: 0 }` for every tick.

**AC-3.** Given climb play shell (`FreeStackShell` / play page root), when a user loads `/play` with motion allowed, then at least **two** of {`.grain`, `.topo`, `.survey-grid`, `.ground-gradient`, `.altimeter`} are present on the climb chrome (not necessarily all on the canvas bitmap), and When `prefers-reduced-motion: reduce`, Then `.reveal` / `animate-groundRise` / `animate-climb` compute to `animation: none` (existing globals.css contract preserved or tightened).

**AC-4 (negative).** Given an identical seed + input log fixture used by existing climb/replay tests, when the pass is applied, then simulated `peakY` / hazard progression for that fixture equals the pre-pass result (byte-identical or exact float equality per existing test helpers) — visual-only modules may differ.

### S2 — Landing / marketing climb cues

**AC-5.** Given the landing hero free tier, when the page renders, then the free-climb control that links to `/play` (a) includes the substring `climb` case-insensitively in its accessible name, (b) has a minimum hit target of 44×44 CSS px, and (c) is not styled as the page’s primary filled `bg-signal` CTA (paid primary remains the sole filled signal CTA in the hero CTA group).

**AC-6.** Given `LandingPage/FreeLeaderboard` (or successor), when climbers exist, then the section heading uses `.font-display` and includes climb language (`climb` or `climber` case-insensitive), and When the list is empty, Then copy still includes climb language and a single `/play` link without adding a second primary pitch on the same section.

**AC-7 (negative).** Given DESIGN.md one-pitch rule, when this pass ships, then the net count of distinct primary filled “play free climb” signal CTAs on `/` does not increase by more than **0** versus baseline (secondary text links may be restyled for emphasis within AC-5).

### S3 — Leaderboard + dashboard

**AC-8.** Given `ClimbPanelIntro` title classes (baseline `text-2xl md:text-3xl`), when the pass ships, then title size classes are one DESIGN.md step stronger and within band ≈1.2× computed font-size at `md` breakpoint (e.g. `text-3xl md:text-4xl` or equivalent tokenized sizes), and the eyebrow still uses `font-mono` + signal.

**AC-9.** Given `FreeClimbCard` rank numeral (baseline `text-4xl`), when the pass ships, then the rank numeral is within **1.15–1.25×** computed font-size of baseline at the default root font size, remains `font-mono tabular-nums`, and the card retains a signal-leaning border or `shadow-signal` (or stronger within NFR glow cap).

**AC-10.** Given climb leaderboard unavailable vs empty states, when `unavailable === true`, then the UI exposes ember-coded “unavailable” messaging (not the empty “no climbers” copy), and When `climbers.length === 0` and `unavailable === false`, Then empty copy mentions climb/climbers; both states keep ≥ 4.5:1 for body text.

**AC-11 (negative).** Given dashboard `FreeClimbEmpty`, when rendered, then it must not use `text-muted` for its body sentence (labels/eyebrows only), and the play control remains ≥ 44×44.

### S4 — A11y / reduced motion

**AC-12.** Given `prefers-reduced-motion: reduce`, when `/play`, `/climb`, and `/` are loaded, then CSS animations listed in `globals.css`’s reduced-motion block for `.reveal`, `.animate-enter`, `.animate-climb`, `.animate-groundRise`, and `.animate-marquee` evaluate to none, and canvas lava shimmer / pickup shake / non-essential particle motion remain suppressed (existing `reducedMotion` props stay wired).

**AC-13.** Given any climb HUD or leaderboard altitude/rank text touched by this pass, when contrast is measured against its authored background token (`void` / `surface` / HUD `SURFACE`), then contrast ratio is **≥ 4.5:1** for text &lt; 18 pt regular (or ≥ 3:1 if large-text criteria apply), and no touched body copy uses `#74707e` on `#0a0a0c` / `#121116`.

**AC-14 (negative).** Given PowerUpHud or climb results `aria-live` announcements, when the same logical message repeats in one run or across a restart, then the announced string still changes enough for AT to re-speak (monotonic suffix/counter or equivalent — ledger Spec quality); this pass must not remove that safeguard if present, and must add it if a touched live region regresses to identical repeats.

### S5 — Physics / score freeze

**AC-15.** Given `app/src/game/powerups.ts` export `RAPID_CLIMB_MULT` and `app/src/game/scoreBounds.ts` persist-path constants (`MAX_ASCENT_SPEED_MPS` and related envelope inputs), when the pass ships, then those numeric exports equal their pre-pass values exactly (assertion by importing the units in tests — **not** by grepping source text).

**AC-16 (negative).** Given a PR diff for this goal, when reviewed, then no file under `app/src/game/` that defines movement multipliers, lava growth, or score envelopes changes those numerics except files that are **documentation-only**; allowed visual constants live under presentation modules (`powerUpVfx`, canvas draw sizes, CSS/Tailwind motion). If a feel change appears to need a sim multiplier, the implementer must `needs_revision` to product-spec rather than edit the multiplier.

### Cross-cutting motion tokens (shared)

**AC-17.** Given Tailwind/ASCENT keyframes `enter` (baseline translateY `16px`, duration `0.7s`) and `climb` (baseline translateY `6px`, duration `0.8s`), when the pass ships, then each tuned token moves **at least one** of {travel distance ↑, duration ↓} into the 1.15–1.25× intensity band (distance ×1.15–1.25 and/or duration ×0.80–0.87), and neither duration falls below **200 ms** for one-shot UI enters.

**AC-18.** Given `.grain` overlay opacity (baseline `0.035`) and `.topo` contour alpha (baseline `signal / 0.05`), when the pass ships, then grain opacity is within **0.040–0.044** and topo alpha within **0.055–0.065**, and neither exceeds NFR caps.

---

## NFRs

| ID | Requirement | Measure |
| --- | --- | --- |
| NFR-1 | Accessibility | WCAG 2.1 AA on all touched climb UI chrome; touch ≥ 44×44; focus-visible rings preserved. |
| NFR-2 | Reduced motion | 100% of amplified CSS/canvas ornamental motion disabled or static under `prefers-reduced-motion: reduce`. |
| NFR-3 | Motion floor/ceiling | One-shot UI animation durations ∈ **[200 ms, 900 ms]** after tuning; infinite ambient (`groundRise`) period may shorten by ≤ 20% but not below **4 s**. |
| NFR-4 | Atmosphere caps | Grain opacity ≤ **0.05**; topo line alpha ≤ **0.08**; signal/ember glow blurs may increase ≤ 20% but must not introduce a new glow token. |
| NFR-5 | Typography band | Climb titles/HUD stay inside DESIGN.md scale (display 48–96, h2 36–48, h3 18–20, mono captions 10–12 where captions remain captions). HUD altitude may exceed caption size (instrument readout) but must remain monospace tabular. |
| NFR-6 | Performance | No new per-tick React state for camera/VFX; no unguarded `canvas.width` assign; climb background ember counts must not increase by more than **20%** of baseline max. |
| NFR-7 | Score integrity | Zero change to legal height-delta envelope and persist-path cap for this pass. |
| NFR-8 | CTA discipline | Net new primary filled climb CTAs on a single surface: **0**. |
| NFR-9 | Design system | No new hex colors; only ASCENT tokens. Radius/spacing stay on the existing scale. |
| NFR-10 | Testability | Every AC mapped to an automated test or a named manual procedure with a binary pass/fail; no source-text-only proofs (kernel gates). |

---

## Risks

| ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | Amplifying landing free climb steals focus from paid primary CTA | Revenue/narrative confusion | AC-5/AC-7; paid remains sole filled signal CTA in hero group |
| R2 | Stronger grain/topo fails AA or looks noisy on mobile | A11y / polish | NFR-4 caps; contrast AC-13 |
| R3 | Implementer “feels slow” → edits `RAPID_CLIMB_MULT` | Score exploits / anti-cheat drift | AC-15/AC-16; out-of-scope freeze |
| R4 | Shake/VFX amplification ignores reduced motion | Vestibular harm | AC-2, AC-12 |
| R5 | Duplicate climb CTAs violate DESIGN.md | Reviewer rejection / UX clutter | AC-7, NFR-8; inventory before edit |
| R6 | Free leaderboard still client-authoritative beside paid stacks | Trust/reputation (pre-existing) | Explicitly **not** closed by this pass; see OQ-1 |
| R7 | Canvas HUD scale + safe-area interactions regress mobile layout | Playability | Keep HUD floor `ui = max(1, width/BASE_WIDTH)`; visual QA on narrow widths |
| R8 | Motion token changes affect non-climb pages sharing `enter`/`reveal` | Global feel drift | Architect documents shared-token blast radius; prefer climb-scoped classes if spillover &gt; climb surfaces |

---

## Open Questions

| ID | Question | Owner | Notes for this pass |
| --- | --- | --- | --- |
| OQ-1 | Is the **free leaderboard** a trust boundary requiring server-derived peaks (AC-17 re-sim)? | product (user) + architect | **Deferred — not accepted and not denied.** This feel pass must not treat `scoreBounds` as closing it. Remains open from security-reviewer → product-spec. |
| OQ-2 | One power-up slot vs stacking? | architect / product | Out of scope; do not change power-up rules for feel. |
| OQ-3 | Should shared global motion tokens (`enter`, `reveal`) be climb-scoped forks? | architect (+ design-ux) | Decide in architecture if blast radius includes paid landing sections unintentionally. |
| OQ-4 | Exact marketing weight of free climb vs paid on `/` | product | This pass slightly amplifies free climb **secondary** presence only; larger narrative shifts need a separate goal. |

---

## Future

- Server-derived free-climb peaks / ranked re-simulation (closes OQ-1).
- Dedicated climb marketing landing separate from paid arena hero.
- Audio stinger pack tuned to 1.2× intensity with gesture-unlocked Web Audio.
- Climb-only motion token namespace so paid surfaces stay calmer.
- Optional “intensity” user setting beyond OS reduced-motion.
- Broader rebrand / season theme overlays.

---

## Baseline snapshot (pre-pass reference)

Recorded for AC math; architect/implementer must re-read sources if drifted:

| Token / constant | Baseline | 1.2× target band |
| --- | --- | --- |
| HUD altitude font UI | `13` | `15–16` |
| Pickup shake amp | `2.2 * ui` | `2.53–2.75 * ui` |
| `enter` travel / duration | `16px` / `0.7s` | ~`18–20px` and/or ~`0.56–0.61s` |
| `climb` travel / duration | `6px` / `0.8s` | ~`7–7.5px` and/or ~`0.64–0.70s` |
| `.grain` opacity | `0.035` | `0.040–0.044` |
| `.topo` signal alpha | `0.05` | `0.055–0.065` |
| `ClimbPanelIntro` title | `text-2xl md:text-3xl` | one step up ≈1.2× |
| `FreeClimbCard` rank | `text-4xl` | ≈1.2× computed size |
| `RAPID_CLIMB_MULT` / score envelopes | current exports | **unchanged** |

---

## Traceability

| Story | ACs |
| --- | --- |
| S1 | AC-1, AC-2, AC-3, AC-4 |
| S2 | AC-5, AC-6, AC-7 |
| S3 | AC-8, AC-9, AC-10, AC-11 |
| S4 | AC-12, AC-13, AC-14 |
| S5 | AC-15, AC-16 |
| Shared motion/atmosphere | AC-17, AC-18 |

**AC count:** 18 (including 5 negative ACs: AC-4, AC-7, AC-11, AC-14, AC-16).
