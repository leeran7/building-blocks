# Tower — Design System (ASCENT)

Dark, high-contrast, data-dense, built around the product's core mechanic: **you
rise, the ground rises to bury you.** The identity is a **duotone** —
**signal-lime `#cbf24d` = ascent / you / #1 / primary actions**, **ember `#ff5a2c`
= the rising ground / burial / danger** — on a warm-obsidian canvas. Recurring
motifs: topographic contours, a grain overlay, and an **altimeter tick ruler**.
Numbers are tabular monospace. Restrained radii, subtle shadows (plus matched
signal/ember glows), generous spacing. WCAG 2.1 AA.

`tailwind.config.ts` + `app/globals.css` are the source of truth.

## Colors

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#0a0a0c` | Page background (warm obsidian) |
| `surface` | `#121116` | Cards / panels |
| `surface-raised` | `#17161c` | Recessed wells |
| `elevated` | `#1e1c24` | Hover surface |
| `border-subtle` | `#24222c` | Hairline borders |
| `border-strong` | `#37343f` | Emphasis borders |
| `text-primary` | `#f4f2ec` | Headings, key values (warm off-white) |
| `text-secondary` | `#a8a4b2` | Body copy |
| `text-muted` | `#74707e` | Labels, captions |
| **`signal` / `brand` / `accent`** | **`#cbf24d`** | Ascent · you · #1 · CTAs · active · bars |
| **`ember`** | **`#ff5a2c`** | Rising ground · burial · danger |
| `warning` `#ffb020` · `success` `#8fd14f` | | Semantic only |

Category wayfinding dots (one category shown at a time — never a rainbow): tech
`#cbf24d` · design `#ff8da3` · business `#f2c14e` · creative `#c39bff` · gaming
`#5be0b0` · science `#6bb8ff`. Arbitrary categories get a deterministic bright
hue via `getCategory()`.

## Typography

- **Display** `.font-display` — **Bricolage Grotesque**, heavy, tight tracking
  (architectural). Used for headlines/section titles, often UPPERCASE.
- **Body / UI** — **Hanken Grotesk** (`font-sans`).
- **Mono / instrument** — **Space Mono** (`font-mono`, tabular): elevation
  readouts, stats, uppercase eyebrow tags like `[ the rules ]`, coordinates.

Scale: display 48–96 · h2 36–48 · h3 18–20 · body 15–16 · caption/mono 10–12
uppercase tracking `0.12–0.2em`.

## Radius · Spacing · Shadow

- Radius: `6` controls · `8` inputs · `12` (`rounded-xl`) cards · `16`
  (`rounded-2xl`) prominent · `999` pills (buttons/tags).
- Spacing: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96` — larger gaps set hierarchy.
- Shadow: `card` · `lifted` = `0 18px 40px -20px rgb(0 0 0/.75)` · `signal` /
  `ember` = hairline ring + matched colored glow (use only on the duotone poles).

## Atmosphere utilities (globals.css)

`.grain` (film noise overlay) · `.topo` (topographic contours) · `.survey-grid`
(measurement grid) · `.ground-gradient` (ember creeping up) · `.altimeter` (tick
ruler) · `.reveal` (staggered fade+rise on load — set `animationDelay` inline).
All motion is `prefers-reduced-motion` guarded.

## CSS variables (globals.css)

```css
:root {
  --color-void: #0a0a0c;   --color-surface: #121116;   --color-elevated: #1e1c24;
  --color-border: #24222c; --color-border-focus: #4a4656;
  --color-text-primary: #f4f2ec; --color-text-muted: #74707e;
  --signal-rgb: 203 242 77;  /* ascent  */
  --ember-rgb:  255 90 44;   /* burial  */
  --accent-rgb: 203 242 77;  /* active accent = signal */
}
```

`accent` resolves to `rgb(var(--accent-rgb, 203 242 77) / <alpha>)`.
`categoryTheme()` is a no-op (single accent = signal); flip it on to re-enable
per-tower accents.

## Buttons

Primary `bg-signal text-void font-semibold rounded-full` (hover `brightness-110`,
active `scale-[0.98]`, `shadow-signal`) · Secondary `rounded-full border-border-strong
bg-surface/60` (hover `border-signal/50`) · Ghost mono uppercase `text-muted`→`text-primary`.
All ship default/hover/active/focus/disabled/loading; min target 44px.
