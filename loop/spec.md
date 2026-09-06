# PRD — Doomstack landing visual pass (POP)

**Product:** Doomstack (ASCENT) — `www.doomstack.lol`  
**Surface:** Landing page `/`  
**paths.spec:** `loop/spec.md`  
**Design source of truth:** `app/DESIGN.md` + `app/tailwind.config.ts` + `app/app/globals.css`  
**Status:** Ready for architect → design-ux insert (UI/UX) → implementer

---

## Goal

Redesign the Doomstack landing page so the first impression is impossible to ignore: bold, catchy, modern, premium, and unmistakably Doomstack/ASCENT (signal lime + ember, topo/grain, warm-obsidian). Deliver a killer hero that makes visitors think “Whoa. What is this?” — striking visuals, expressive typography, intentional motion, and depth — then pull them down the page.

Address the prior ~7/10 critique without inventing a second brand system:

1. **Brand first** — `DOOMSTACK` is a hero-level signal, not only nav text.
2. **Hero budget** — brand + one headline + one short support + one CTA group + one full-bleed product visual.
3. **No cards / stat strips / dual paid+free competition** in the first viewport.
4. **Free climb below the fold** — after the paid stack directory.
5. **Empty paid arena** — never let a demoralizing live `0` be the hero’s primary number (demo / alternate copy is in scope; seeding real payments is out).

---

## Scope

### In scope

| Area | Change |
| --- | --- |
| `Hero` | Rebuild composition per budget; hero-level `DOOMSTACK` wordmark; full-bleed visual plane; remove first-viewport clutter |
| `HowItWorks` | Polish for scroll rhythm / hierarchy only (still exactly 3 steps) |
| `TowerDirectory` | Presentation polish only; keep paid directory interactive cards |
| `FreeLeaderboard` | Remain **after** paid directory; empty-state copy that keeps vibe without a dead `0` hero |
| `Faq` / `Footer` | Light polish for scroll rhythm / consistency with ASCENT |
| Motion | 2–3 intentional landing moments; all gated by `prefers-reduced-motion` |
| Atmosphere | Depth via existing ASCENT utilities (`.grain`, `.topo`, gradients, glows) — not flat void |
| Empty paid data | Hero / social-proof presentation when live block totals are `0` |

### Out of scope

- Backend, DB, Prisma, Redis, Stripe, seeding real paid blocks
- Auth flows, new product features, renaming the product
- Game mechanics, climb physics, power-ups, score trust/re-sim
- Admin / social surfaces
- Light-mode redesign or a second token system
- Changing how payments create blocks

### Assumptions

- A1. Public brand string is **`DOOMSTACK`** (matches Navbar / Footer / StackMark pairing).
- A2. ASCENT tokens in `app/DESIGN.md` remain the only color/type system.
- A3. Fonts stay **Bricolage Grotesque** (display), **Hanken Grotesk** (body), **Space Mono** (instrument).
- A4. Existing section landmarks (`aria-label="Hero"`, `#towers`, `#free`, HowItWorks 3-step `ol`, Footer) stay usable as QA anchors (ids/labels may be extended with `data-testid` if architect chooses).
- A5. “Above the fold / first viewport” for QA means: **inside the Hero section’s DOM subtree** plus any sibling that sits between Navbar and the first post-hero section — not a pixel screenshot taste test.
- A6. Free-climb leaderboard trust boundary (client `peakY`) remains an open product question; this pass does **not** close it.

### Constraints

- C1. Preserve dark warm-obsidian + signal `#cbf24d` + ember `#ff5a2c`.
- C2. Do not invent a second design-token set or swap to purple/cream/broadsheet aesthetics.
- C3. Cards are allowed only as interactive containers (e.g. expandable tower cards); **never in the hero**.
- C4. No detached labels / badges / chips overlaid on the hero media plane.
- C5. Full-bleed hero visual: dominant edge-to-edge plane — not an inset rounded media card, side-panel thumbnail, or floating collage.
- C6. WCAG 2.1 AA for text and controls on the landing; primary CTA remains signal-on-void (or equivalent ≥4.5:1).
- C7. Touch targets for interactive controls ≥ 44×44 CSS px.

### Future (explicitly not this pass)

- Seed / campaign to populate live paid blocks
- Server-derived free-climb peaks (close free-leaderboard trust OQ)
- Marketing microsites, blog, or campaign landing variants
- Motion beyond 3 intentional moments (scroll-jacking, Lottie packs, 3D engines)
- A/B test harness for hero copy

---

## Personas

### P1 — Arena shopper (primary)

A founder or marketer who landed on doomstack.lol from a link or search. They have 5 seconds of attention. They need an instant “what is this / why care” hit, then a clear path to browse paid stacks or enter the arena.

### P2 — Scroll skeptic

A design-aware visitor who bounces on generic dark SaaS landings. They stay only if the composition feels premium, branded, and different — and if the page rewards scrolling without dumping a dashboard in their face.

### P3 — Free warmer

A player who wants the free climb. They must still find it, but **after** understanding paid stacks are the main product — not competing in the hero.

---

## Stories

### US-1 — Brand-first hero composition

**As** an arena shopper (P1),  
**I want** the first screen to lead with DOOMSTACK plus one clear pitch and one dominant visual,  
**so that** I immediately know the brand and want to keep going.

**Happy path:** Visitor loads `/`; hero shows DOOMSTACK at display scale, one headline, one support line, one CTA group, one full-bleed visual; they click the primary CTA.  
**Failure case:** Hero is a dashboard of stats / dual paid+free tiers / badge clutter; brand exists only in the sticky nav — visitor cannot tell what product this is if nav is ignored.

### US-2 — Scroll rhythm: paid first, free later

**As** an arena shopper (P1),  
**I want** paid stacks explained and listed before the free climb,  
**so that** the conversion path stays primary and free feels like a warm-up, not a rival product.

**Happy path:** After hero, visitor sees How it works → paid directory (`#towers`) → free leaderboard (`#free`) → FAQ → footer.  
**Failure case:** Free climb CTAs, free stats, or `#free` content appear inside the hero / first viewport and compete with paid.

### US-3 — Empty arena without killing the vibe

**As** a scroll skeptic (P2),  
**I want** an empty paid arena to still feel like a living product,  
**so that** a cold start does not read as “this place is dead.”

**Happy path:** When live paid block total is `0`, hero uses demo / illustrative treatment and invitation copy; directory empty stacks keep claim framing.  
**Failure case:** Hero’s primary number is a large live `0` (or “0 blocks”) that undercuts the arena promise.

### US-4 — Motion with respect

**As** a visitor with motion sensitivity (P2),  
**I want** decorative motion to stop when I prefer reduced motion,  
**so that** the page stays usable and calm without losing structure.

**Happy path:** Default: 2–3 intentional motion moments on landing. With `prefers-reduced-motion: reduce`, those animations do not run.  
**Failure case:** Unrelated perpetual noise animations, or reduced-motion ignored.

### US-5 — Mobile first viewport integrity

**As** a mobile visitor,  
**I want** the landing to fit a 375px-wide viewport without horizontal scrolling,  
**so that** the hero composition stays one readable screen.

**Happy path:** At 375×812 CSS px, `document.documentElement.scrollWidth <= clientWidth`.  
**Failure case:** Full-bleed visual or type scale forces horizontal overflow.

---

## Acceptance criteria

Numbering is global. Each AC is Given / When / Then and mechanically checkable (DOM order, roles, classes, computed styles, media queries, viewport metrics). Taste words (“wow”, “premium feel”) are **not** criteria.

### US-1 — Brand-first hero

**AC-1 — Hero-level DOOMSTACK wordmark**  
**Given** the landing page at `/`  
**When** the Hero section (`section[aria-label="Hero"]`, or equivalent stable `data-testid="landing-hero"`) is inspected  
**Then** it contains a visible text node exactly `DOOMSTACK` (or with a single decorative mark sibling) that uses the display font utility (`.font-display` / computed `font-family` including `Bricolage`) and is **not** solely the Navbar wordmark  
**And** that hero wordmark’s computed `font-size` is ≥ `40px` at viewport width ≥ `1024px`  
**And** the Navbar may still show `DOOMSTACK`, but removing the Navbar from the DOM leaves at least one `DOOMSTACK` text node inside the Hero section

**AC-2 — Hero element budget (allowed)**  
**Given** the Hero section subtree  
**When** its visible marketing content is enumerated  
**Then** it includes **exactly one** `h1`  
**And** exactly one supporting paragraph that is the primary pitch (no second body pitch competing at the same hierarchy)  
**And** exactly one primary CTA group (one primary link/button; at most one secondary link in that same group)  
**And** exactly one product visual region marked decorative (`aria-hidden="true"`) or labelled as the hero visual via a single stable test id

**AC-3 — Hero element budget (forbidden in Hero)**  
**Given** the Hero section subtree  
**When** it is queried for first-viewport clutter patterns  
**Then** it contains **none** of:  
- a Free / Paid dual-tier stat strip (no paired “Paid” + “Free” pill labels inside Hero)  
- a multi-metric instrument grid of live counters as a primary hero block (e.g. 2×2 `dl` of live stats)  
- a SocialProofStrip / “N blocks live” banner  
- the FreeLeaderboard section (`#free` / `aria-label` containing “Free climb”)  
- TowerDirectory (`#towers`)  
- detached badge/chip/overlay labels positioned on top of the hero visual media (instrument chrome that is part of a full-bleed visual plane’s own edges is allowed only if it is not a floating marketing sticker)

**AC-4 — Full-bleed visual, not a card**  
**Given** the Hero’s product visual region  
**When** its outermost visual plane element is inspected  
**Then** it does **not** combine `rounded-2xl` (or ≥16px corner radius) **with** a visible card border + opaque `bg-surface` panel treatment that insets it as a floating media card  
**And** at viewport width ≥ `1024px`, the visual plane’s border-box width is ≥ `90%` of the Hero section’s content box width **or** spans the full viewport width as a background plane  
**And** the visual is not presented as a side-panel thumbnail whose width is ≤ `40%` of the hero with the pitch taking the rest as a dashboard split of equal cards

**AC-5 — Brand test (nav-independent)**  
**Given** a DOM snapshot of `/` with the Navbar node removed  
**When** the first viewport composition (Hero) is evaluated for brand presence  
**Then** `DOOMSTACK` remains present in Hero at display scale (AC-1)  
**And** signal and ember tokens remain in use in Hero styles (at least one computed color matching signal `#cbf24d` / `rgb(203, 242, 77)` and one matching ember `#ff5a2c` / `rgb(255, 90, 44)` within the Hero subtree)

**AC-6 — Negative: no second brand system**  
**Given** landing styles for `/`  
**When** new CSS variables or Tailwind theme colors introduced by this change are listed  
**Then** no parallel light-mode cream/purple token set is added for the landing  
**And** page background remains ASCENT void (`#0a0a0c` / `bg-void` or equivalent token)

### US-2 — Section order & free below paid

**AC-7 — Document section order**  
**Given** `/` main content (`#main-content`)  
**When** landmark sections are listed in DOM order  
**Then** order is: Hero → HowItWorks → TowerDirectory (`#towers`) → FreeLeaderboard (`#free`) → Faq → Footer  
**And** any social-proof / live-count strip, if present, appears **after** Hero and **must not** appear inside Hero (AC-3)

**AC-8 — Free climb below paid directory**  
**Given** `/`  
**When** comparing document positions of `#towers` and `#free`  
**Then** `#free.compareDocumentPosition(#towers)` indicates `#towers` precedes `#free`  
**And** Hero contains no `href="/play"` primary CTA that outranks the paid primary CTA (free play may appear only below the fold / in later sections or nav)

**AC-9 — HowItWorks still three steps**  
**Given** the HowItWorks section  
**When** its ordered list of steps is counted  
**Then** there are exactly `3` step items (`ol > li` or equivalent labelled steps)

**AC-10 — Negative: free not in first composition**  
**Given** the Hero section  
**When** searched for free-climb marketing  
**Then** there is no visible “Free” tier pill, free climber count, or “Top climb” live free metric inside Hero

### US-3 — Empty arena presentation

**AC-11 — Hero must not lead with live zero**  
**Given** the page is rendered with paid `totalBlocks === 0` (or equivalent prop/fixture)  
**When** the Hero section is inspected for its primary numeric callout  
**Then** Hero does not display a live total whose visible text is exactly `0` as the dominant/stat headline number  
**And** if a number appears in Hero, it is part of an explicitly illustrative/demo treatment (e.g. demo altitudes in the visual) or non-zero pricing floor copy (e.g. `from $X`), not “0 blocks”

**AC-12 — Demo / alternate empty treatment**  
**Given** `totalBlocks === 0`  
**When** Hero renders  
**Then** the hero visual still shows a populated illustrative stack **or** invitation copy that does not claim “0 blocks live”  
**And** any below-hero social-proof strip either omits a numeric `0` blocks claim or uses non-numeric fallback copy (e.g. “Join the leaderboard” / “Claim #1”)

**AC-13 — Directory empty stacks stay invitational**  
**Given** a paid stack with `count === 0` in TowerDirectory  
**When** its card is rendered  
**Then** it does not show the character `0` as the live count  
**And** it shows an invitational affordance (existing “Claim #1” / em dash pattern or equivalent)

### US-4 — Motion

**AC-14 — Intentional motion count**  
**Given** the landing page CSS/animation definitions used by Hero + below-fold polish  
**When** distinct intentional motion moments shipping in this pass are counted  
**Then** there are **2 or 3** named moments (e.g. staggered reveal, ground-rise, one scroll/hover accent) documented in architecture  
**And** there is no unbounded additional marquee/particle noise layer added beyond that budget

**AC-15 — prefers-reduced-motion**  
**Given** `@media (prefers-reduced-motion: reduce)`  
**When** landing motion utility classes used by the redesign (including `.reveal` and any new animation classes introduced) are evaluated  
**Then** each has `animation: none` (or equivalent disable) under that media query  
**And** a Playwright/emulated `prefers-reduced-motion: reduce` pass shows those animated properties are not actively running on Hero load

### US-5 — Mobile / a11y envelope

**AC-16 — 375px no horizontal overflow**  
**Given** a viewport of `375×812` CSS pixels  
**When** `/` is loaded  
**Then** `document.documentElement.scrollWidth <= document.documentElement.clientWidth`  
**And** the Hero `h1` and DOOMSTACK wordmark remain fully within the viewport width (no clipped essential brand text)

**AC-17 — Contrast & targets**  
**Given** the Hero primary CTA and secondary CTA (if any)  
**When** contrast and hit areas are measured  
**Then** primary CTA text/background contrast is ≥ `4.5:1`  
**And** each CTA’s clickable box is ≥ `44×44` CSS px  
**And** `text-muted` (`#74707e`) is not used for body copy ≤11px on void (decorative glyphs only)

**AC-18 — Negative: cards excluded from Hero**  
**Given** the Hero section  
**When** searching for interactive card grid patterns  
**Then** there are no expandable tower cards, category card grids, or `rounded-2xl`+`border`+`bg-surface` content cards inside Hero  
**And** TowerDirectory cards remain allowed only inside `#towers`

---

## NFRs

| ID | Requirement | Measure |
| --- | --- | --- |
| NFR-1 | LCP-relevant hero remains CSS/DOM (no new heavy 3D/canvas dependency for the landing hero unless architect proves ≤ existing weight) | `package.json` / bundle: **0** new animation/3D libraries for this pass |
| NFR-2 | Landing TTFB/ISR behavior unchanged | `revalidate = 60` (or current equivalent) retained on `app/app/page.tsx` |
| NFR-3 | No new auth, payment, or climb API routes | Diff adds **0** files under `app/app/api/**` |
| NFR-4 | Accessibility | WCAG 2.1 AA for landing text/controls; decorative visual `aria-hidden` |
| NFR-5 | Reduced motion | All new decorative animations honor `prefers-reduced-motion` (AC-15) |
| NFR-6 | Mobile envelope | 375px width, no horizontal overflow (AC-16) |
| NFR-7 | Design token integrity | Colors/type from ASCENT only; no second token file |
| NFR-8 | Scale | Static/ISR landing; no new per-request DB fan-out beyond existing block-count + climb stats fetches |
| NFR-9 | CTA discipline | One primary paid pitch in Hero; do not duplicate “Enter the arena” pitch in Navbar |

---

## Risks

| ID | Risk | Mitigation |
| --- | --- | --- |
| R-1 | Empty live data still leaks via SocialProofStrip or directory totals | AC-11–AC-13; strip copy fallback; keep directory “—” / Claim #1 |
| R-2 | Full-bleed visual regresses into another inset card during implementation | AC-4 + AC-18 mechanical class/geometry checks |
| R-3 | Motion noise / ignoring reduced-motion | Hard cap 2–3 moments (AC-14) + media query gate (AC-15) |
| R-4 | Brand wordmark only bumped in nav (critique repeats) | AC-1 + AC-5 nav-removed check |
| R-5 | Free climb trust boundary still open while `#free` stays on landing | Leave OQ-1 open; out of scope for this visual pass |
| R-6 | Scope creep into seeding payments or backend | Explicit OUT; NFR-3 |
| R-7 | `text-muted` contrast regressions on small type | AC-17; existing ledger lesson |
| R-8 | Unimported `GameOverlay.tsx` still dead | Do not treat overlay edits as live landing work unless wired |

---

## Open Questions

| ID | Question | Decision for this pass |
| --- | --- | --- |
| OQ-1 | Is the free leaderboard a trust boundary requiring server-derived peaks? | **Deferred.** Visual pass only; do not mark closed. |
| OQ-2 | Exact hero headline copy (“CLIMB. OR GET BURIED.” vs alternatives) | Implementer/design-ux may refine wording **as long as** AC-2 (single `h1`) holds; product does not lock a slogan string in this PRD. |
| OQ-3 | Should SocialProofStrip remain at all when totals are cold? | Allowed below Hero with non-zero-safe copy (AC-12); removal also acceptable. |
| OQ-4 | Power-up one-slot vs stacking | Unrelated; leave open. |

---

## Future

- Seed campaigns / admin tools to populate paid blocks for demos
- Close OQ-1 with server re-sim for free peaks if product accepts the trust boundary
- Optional scroll-driven storytelling sections beyond the current FAQ
- Localized landings / campaign UTMs

---

## Traceability (current → target)

| Critique | Current (`Hero.tsx` / `page.tsx`) | Target ACs |
| --- | --- | --- |
| Brand only in nav | Hero `h1` is “CLIMB…”; no hero `DOOMSTACK` | AC-1, AC-5 |
| Hero over budget | Season chip + dual Paid/Free stat strips + sign-in + inset visual | AC-2, AC-3, AC-10, AC-18 |
| Inset card visual | `ElevationProfile` uses `rounded-2xl border bg-surface` card | AC-4 |
| Free competes up top | Free stats + `/play` chip in Hero; SocialProof between Hero and HowItWorks | AC-7, AC-8, AC-10 |
| Live `0` kills vibe | `stats.totalBlocks.toLocaleString()` can render `0` in Hero | AC-11, AC-12 |
| Free below paid | `#free` already after `#towers` — **keep** | AC-7, AC-8 |

---

## Handoff note for orchestrator

`nextStage`: **architect**.  
UI/UX requirements are load-bearing — **design-ux should insert after architect** (before implementer) to specify composition, motion moments, and full-bleed treatment within ASCENT tokens while implementing against AC-1–AC-18.
