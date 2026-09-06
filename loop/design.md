# Design — Doomstack landing POP pass

**Role:** design-ux (look & feel only — no implementation)  
**Spec:** `loop/spec.md` AC-1–AC-18  
**Architecture:** `loop/architecture.md`  
**Token SoT:** `app/DESIGN.md` + `app/tailwind.config.ts` + `app/app/globals.css`  
**Status:** Ready for **implementer**

> Creativity bar: visitors must think “Whoa. What is this?” — memorable, premium, asymmetric, atmospheric — still unmistakably Doomstack/ASCENT. **No second token system.**

---

## 1. Visual direction (one sentence)

A **burial-horizon arena**: massive `DOOMSTACK` carved into a warm-obsidian topo field, with a full-bleed illustrative paid stack rising above an ember ground that wants to swallow it — pitch and CTAs as a single tight column floating over depth, never a dashboard.

### Mood board keywords (for implementers)

| Do | Don’t |
| --- | --- |
| Survey / altimeter / permanent altitude | Generic dark SaaS hero split |
| Signal lime = you / #1; ember = burial | Purple gradients, glassmorphism stacks |
| Architectural Bricolage, tight tracking | Inter/Roboto/system defaults |
| Grain + topo + dual radial washes | Flat void slab |
| Asymmetric type over / against the plane | Equal two-card columns |
| 2–3 intentional motion beats | Marquee, particles, perpetual noise |

### Brand test (AC-5)

If Navbar is removed, the first viewport must still scream **DOOMSTACK** at display scale, with both **signal** and **ember** present in the Hero subtree.

---

## 2. Screen inventory

| Route | Entry | Exit | Auth | Primary action |
| --- | --- | --- | --- | --- |
| `/` landing | Direct / marketing link | CTA → signup, browse → `#towers`, later `#free` / FAQ | Public ISR | **Enter the arena** → `/auth/signup` |
| (in-page) `#how-it-works` | Scroll / skip | Continue to `#towers` | Public | Understand 3 stations |
| (in-page) `#towers` | Hero secondary / scroll | Expand card → InlineTower; claim empty | Public | Browse / claim a stack |
| (in-page) `#free` | Scroll after paid | `/play` | Public | Warm-up climb (secondary) |

**No new routes.** Navbar keeps plain “Get started” (NFR-9 — do not duplicate “Enter the arena” in nav).

---

## 3. Annotated user flows

### Happy path — Arena shopper (P1)

```mermaid
flowchart LR
  A[Land /] --> B[Hero: DOOMSTACK + pitch]
  B --> C{CTA}
  C -->|Enter the arena| D[/auth/signup]
  C -->|Browse stacks| E[#towers]
  B --> F[Scroll HowItWorks]
  F --> E
  E --> G[Expand / claim stack]
  E --> H[#free warm-up optional]
  H --> I[FAQ → Footer]
```

**Inline errors / empty:** cold paid data never shows live `0` as the hero’s primary number (AC-11). Directory empty stacks keep `—` + Claim #1 (AC-13). Free empty keeps invitational mono copy (no demoralizing zero hero).

### Motion-sensitive visitor (US-4)

Default: M1 → M2 → M3 fire once / hover.  
`prefers-reduced-motion: reduce`: all three disabled; final static composition still readable (brand, h1, pitch, CTAs, populated demo visual).

### Mobile 375 (US-5)

Single column; brand + h1 fit without clip; no horizontal overflow; visual plane stacks **under** pitch as full-bleed band (not a side thumbnail).

---

## 4. Killer hero — composition spec

### 4.1 Concept name: **Burial Horizon**

The Hero is **one composition**, not a pitch card beside a media card.

1. **Atmosphere shell** (full section): `.topo` + page `.grain` (if already on layout) + dual radials (signal wash ~15%/-10%, ember pool ~90%/110%) — intensify opacity slightly vs current (~0.12 / ~0.10) but stay subtle.
2. **Brand + pitch column** — left-biased on ≥1024; centered on mobile — sits in the upper/mid field with a soft void scrim behind text only (gradient fade), **not** a bordered card.
3. **Full-bleed product visual** — edge-to-edge (or ≥90% of hero content width at ≥1024) **ElevationProfile plane** as the dominant visual: illustrative ranked stack + altimeter + ember ground. It is a **background/foreground plane**, not an inset `rounded-2xl` + `border` + `bg-surface` card.

**Recommended desktop layout (≥1024):**

```
┌──────────────────────────────────────────────────────────────┐
│  topo + grain + signal/ember radials                         │
│                                                              │
│   DOOMSTACK                    ┌──────────────────────────┐  │
│   (display ≥72px)              │                          │  │
│                                │   FULL-BLEED STACK PLANE │  │
│   CLIMB. OR GET                │   (altimeter + demo bars │  │
│   BURIED.                      │    + ground-gradient)    │  │
│   (h1 — ember on BURIED)       │                          │  │
│                                │   spans ≥90% width /     │  │
│   one support sentence         │   bleeds to section edge │  │
│                                └──────────────────────────┘  │
│   [Enter the arena] [Browse]                                 │
│                                                              │
│   ← type column overlaps / anchors left; visual is the plane →│
└──────────────────────────────────────────────────────────────┘
```

**Critical:** Do **not** recreate today’s equal `1.05fr / 0.95fr` dashboard split with an inset rounded card. Prefer:

- **Option A (preferred):** Visual is a full-width band under or behind the type; type overlays the left ~45% with a left→transparent void scrim for AA contrast.
- **Option B:** Visual still right-weighted but **flush** to section edges (no card chrome); width ≥90% of hero; radius 0 on the outer plane; atmosphere bleeds through.

Instrument chrome (mono “Paid stack · demo”, ground readout) may live on the **plane’s own top/bottom edges** — never as floating marketing badges/chips stuck on the media (AC-3 / C4).

### 4.2 Exact element budget (AC-2)

Inside `section[aria-label="Hero"][data-testid="landing-hero"]` — **only**:

| # | Element | Spec |
| --- | --- | --- |
| 1 | Brand wordmark | Visible text `DOOMSTACK` · `.font-display` · ≥40px (≥1024); target **clamp(2.75rem, 8vw, 6rem)** (~44–96px). Optional single decorative mark sibling (e.g. StackMark) — not a season chip. |
| 2 | Exactly one `h1` | Recommended: keep **CLIMB. OR GET BURIED.** with **BURIED.** in `text-ember` + hairline ember underline. OQ-2 allows refine if still one h1. |
| 3 | Exactly one support `p` | One pitch, `text-text-secondary` 16–18px, max ~28–36ch. Keep permanence + rising-ground idea. |
| 4 | One CTA group | `data-testid="landing-hero-cta"`: primary **Enter the arena** → `/auth/signup` (`bg-signal text-void shadow-signal`); secondary **Browse stacks** → `/#towers`. No third pitch. |
| 5 | One product visual | `data-testid="landing-hero-visual"` `aria-hidden="true"`: full-bleed ElevationProfile. |

**Remove from Hero (AC-3, AC-8, AC-10, AC-18):**

- Season chip / “74 stacks live” pill  
- Paid + Free dual stat strips  
- Free climber / top climb metrics  
- `/play` chip  
- “Already climbing? Sign in”  
- Any `rounded-2xl`+`border`+`bg-surface` content cards  
- Live `totalBlocks` as dominant number (especially `0`)

### 4.3 Type hierarchy (ASCENT scale only)

| Role | Font | Size guidance | Color |
| --- | --- | --- | --- |
| `DOOMSTACK` | Bricolage `.font-display` | ≥40px desk; push toward 72–96 | `text-primary`; optional signal tick/dot sibling |
| `h1` | `.font-display` | `text-5xl`→`text-7xl`/`text-8xl` — **must not overpower brand** (brand ≥ or visually equal weight) | primary; **BURIED** → ember |
| Support | Hanken | `text-base`/`text-lg` | `text-secondary` |
| CTA | sans semibold | 16px, min-h 52 | signal/void · secondary border |
| Instrument (visual only) | Space Mono | 10–11px uppercase tracking 0.14–0.18em | secondary / ember |

**Brand-first rule:** If the h1 feels louder than `DOOMSTACK`, shrink h1 or enlarge brand — brand is the hero signal.

### 4.4 Full-bleed ElevationProfile rebuild

**Outer plane — forbidden combo:** `rounded-2xl` + visible card border + opaque `bg-surface` inset treatment.

**Outer plane — required:**

- Width ≥90% of hero content box **or** `100vw` background plane at ≥1024  
- Prefer `rounded-none` on the outermost visual; optional hairline `border-border-subtle` only if it reads as survey frame, not a floating card  
- Backdrop: `survey-grid` + transparent/void wash (not opaque surface slab)  
- Keep **DEMO_BLOCKS** illustrative stack (empty-arena safe)  
- Keep altimeter ticks + ranked bars + ground divider + `.ground-gradient.animate-groundRise` at base  
- Header chrome on the plane edge: e.g. `Paid stack · demo` (mono) — **not** “live” when `totalBlocks === 0`  
- Ember ground readout stays part of the plane edge, not a sticker overlay  

**Demo altitudes** in the visual are illustrative — allowed even when live arena is empty (AC-11/12).

### 4.5 Depth recipe (existing utilities only)

Layer back→front:

1. `bg-void` page  
2. Section `.topo`  
3. Dual radials (signal + ember)  
4. Full-bleed visual plane (survey-grid, bars, altimeter)  
5. `.ground-gradient` rising from bottom of visual  
6. Soft void scrim under type for contrast  
7. Type + CTAs  
8. Global `.grain` (layout-level)

**Glows:** `shadow-signal` on primary CTA and #1 demo bar only; ember glow reserved for ground / buried bars. No purple, no multi-layer glass stacks.

### 4.6 Motion beats (exactly 3 — AC-14)

| ID | Moment | Timing | Reduced motion |
| --- | --- | --- | --- |
| **M1** Staggered hero reveal | `.reveal` on brand → h1 → pitch → CTA (`animationDelay` 0 / 80 / 160 / 240ms) | Existing `enter` 0.7s | `animation: none` (globals already) |
| **M2** Ground rise | `.ground-gradient.animate-groundRise` on visual base | Existing 6s ease-in-out infinite | Disabled + transform none |
| **M3** Accent | **Primary CTA hover** brightness + arrow `translate-x` (reuse existing) — **do not** also add a new perpetual particle layer. Optional: keep a **single** short `animate-climb` stagger on demo bars (≤6 items, one-shot) **instead of** inventing a fourth moment — if climb stagger ships, it **is** M3 and CTA hover stays CSS-only transition (not counted as a fourth named animation). | Prefer CTA hover as M3 for simplicity | Gate any animation class |

**Hard cap:** no marquee, no extra particle/noise layers (AC-14).

### 4.7 Empty-arena treatment (AC-11, AC-12)

| Condition | Hero behavior |
| --- | --- |
| `totalBlocks === 0` | Show DEMO_BLOCKS visual; plane chrome says **demo** / invitation — never “0 blocks” / live zero as dominant number |
| Copy | Support line or CTA-adjacent pricing floor only: e.g. permanence pitch + optional “from $N” in secondary CTA context — **not** a big `0` |
| `totalBlocks > 0` | Still **no** dual Free/Paid instrument grid in Hero; live counts belong below fold (SocialProof optional / directory) |

**Props contract (from architecture):** `HeroStats = { totalBlocks, minEntryUsd }` — `totalBlocks` drives branch only; never render as hero headline when 0.

### 4.8 Contrast & a11y (AC-17)

| Pair | Approx ratio | Notes |
| --- | --- | --- |
| `text-primary` `#f4f2ec` on `void` `#0a0a0c` | ~16:1 | Brand, h1 |
| `text-secondary` `#a8a4b2` on void | ~7.5:1 | Support body |
| `signal` `#cbf24d` text on void | ~13:1 | Accents |
| Primary CTA: `void` on `signal` | ~15:1 | ≥4.5:1 ✓ |
| Ember `#ff5a2c` on void | ~4.6:1 | Large text for “BURIED.” OK; avoid ember for ≤11px body |
| `text-muted` `#74707e` on void | ~4.3:1 | Decorative mono ≥10px only — **not** body ≤11px |

CTAs: min hit box **44×44** (ship **52** min-height as today). Visual decorative: `aria-hidden="true"`. Focus rings: signal ring on void offset.

### 4.9 Component states — Hero

| State | Behavior |
| --- | --- |
| Default | Budget elements + demo visual + atmosphere |
| Loading | N/A (ISR server render) |
| Empty arena (`totalBlocks===0`) | Demo visual + invitation; no live `0` |
| Error (counts fetch failed) | Same as empty (counts `{}`) |
| Disabled CTA | Not used on landing primary |
| Active / hover CTA | brightness-110, scale 0.98 active, arrow nudge |
| Keyboard | Tab order: primary → secondary; visible focus |
| Reduced motion | M1–M3 off; static final frame |

---

## 5. Scroll storyboard (one job each)

Order (AC-7): **Hero → HowItWorks → TowerDirectory `#towers` → FreeLeaderboard `#free` → Faq → Footer**

Optional: thin **SocialProofStrip after Hero** with zero-safe copy — or omit (ADR-4). **Recommendation:** omit the strip when `totalBlocks === 0`; if kept when live > 0, place **after** Hero only. Prefer less chrome — cold start skips the strip.

| Beat | Section | One job | Why they keep scrolling |
| --- | --- | --- | --- |
| 0 | **Hero** | Brand shock + one pitch + enter | “What is this?” answered; curiosity about how altitude works |
| 1 | **HowItWorks** | Teach the burial mechanic in **exactly 3** stations | Rules feel fair/legible → trust to browse stacks |
| 2 | **Towers** | Pick a category arena (interactive cards OK) | Land-grab / Claim #1 / live ranks — conversion |
| 3 | **Free** | Warm-up climb, clearly secondary | Practice without competing with paid in the hero |
| 4 | **FAQ** | Objection crushing | Resolve “is this real money?” before footer |
| 5 | **Footer** | Brand close + utility links | Exit without dead end |

### Section polish notes (rhythm only)

**HowItWorks**

- Keep 3 `ol > li` (AC-9).  
- Display h2; mono `[ the rules ]` eyebrow.  
- Station cards are **interaction/education containers** — allowed (not hero). Ember tone on station 02 only.  
- Primer band stays below steps — one job: rate floors.  
- Spacing: `py-20`–`py-24`; increase title→list gap if needed for breath after hero intensity.

**TowerDirectory**

- Cards allowed (expandable).  
- Intro copy: if `totalLive === 0`, **do not** say `0 blocks climbing` — use “74 stacks · claim #1” / “Join the leaderboard” style (AC-12 spirit).  
- Empty card: keep `—` + Claim #1 · from $N (AC-13).  
- Signal wayfinding dots; survey-grid on hover OK.

**FreeLeaderboard**

- Visually quieter than paid (secondary type on h2 is fine).  
- Empty: keep `[ no climbers yet ]` + play CTA — invitational, not a giant 0.  
- Remains after `#towers` (AC-8).

**Faq / Footer**

- Light consistency: borders `border-subtle`, mono eyebrows, display section titles where present.  
- Footer keeps DOOMSTACK + StackMark pairing.

---

## 6. Mobile 375 composition

```
┌─────────────────────┐  375 × ~812
│  topo / washes      │
│                     │
│     DOOMSTACK       │  display ~44–56px, centered
│                     │
│   CLIMB. OR GET     │  h1 ~40–48px, 3 lines OK
│   BURIED.           │
│                     │
│   support (≤36ch)   │
│                     │
│ [ Enter the arena ] │  full-width, min-h 52
│ [ Browse stacks   ] │  full-width
│                     │
│ ┌─────────────────┐ │
│ │ full-bleed      │ │  plane under pitch; no side
│ │ stack visual    │ │  thumbnail; width ~100% of
│ │ + ground rise   │ │  content; no inset card
│ └─────────────────┘ │
└─────────────────────┘
```

**Checks (AC-16):**

- `scrollWidth <= clientWidth`  
- Brand + h1 fully in viewport width (allow wrap, not clip)  
- No horizontal scroll from 100vw + padding traps — prefer `w-full` over raw `100vw` inside padded sections  
- Touch targets ≥44px  

---

## 7. Wireframe — DOM / QA anchors

```
#main-content
├── Navbar                          # DOOMSTACK OK; CTA "Get started" only
├── section[aria-label=Hero][data-testid=landing-hero]
│   ├── DOOMSTACK (.font-display)
│   ├── h1
│   ├── p
│   ├── [data-testid=landing-hero-cta]
│   └── [data-testid=landing-hero-visual][aria-hidden]
├── (optional SocialProof — after Hero, zero-safe)
├── HowItWorks#how-it-works         # ol > li × 3
├── TowerDirectory#towers
├── FreeLeaderboard#free
├── Faq
└── Footer
```

---

## 8. Hard don’ts (this pass)

- No purple gradients / cream-terracotta light template / broadsheet hairline newspaper look  
- No glassmorphism overload  
- No badge/chip overlays on hero media  
- No cards in Hero  
- No dual paid+free stat strips in first viewport  
- No second color/type token file  
- No new animation libraries  
- Do not treat this pass as closing free-climb peakY trust (OQ-1)

---

## 9. Implementer checklist (traceability)

| AC | Design intent locked |
| --- | --- |
| AC-1 / AC-5 | Hero owns display `DOOMSTACK`; signal+ember in Hero |
| AC-2 | Brand + h1 + p + CTA group + one visual |
| AC-3 / AC-10 / AC-18 | Declutter list + no hero cards |
| AC-4 | Full-bleed / ≥90% plane, not inset card |
| AC-6 / NFR-7 | ASCENT only |
| AC-7–AC-9 | Section order + 3 steps |
| AC-11–AC-13 | Empty arena copy/visual rules |
| AC-14–AC-15 | M1–M3 + reduced motion |
| AC-16–AC-17 | 375 envelope + contrast/targets |

**Artifact for implementer:** this file + `loop/architecture.md` + `app/DESIGN.md` (Landing POP pointer).
