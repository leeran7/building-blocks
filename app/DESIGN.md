# Tower — Design System (Dark Editorial)

Dark, high-contrast, data-dense, editorial. **Cyan `#00d4ff` is the one and only
accent** — used for identity, primary actions, active states, and altitude bars.
Category identity is a small colored dot + label only (never a color wash).
Numbers are tabular monospace. Restrained radii, subtle single-layer shadows,
generous spacing. WCAG 2.1 AA.

`tailwind.config.ts` + `app/globals.css` are the source of truth.

## Colors

| Token | Hex | Role |
| --- | --- | --- |
| `void` | `#0a0a0f` | Page background |
| `surface` | `#111118` | Cards / panels |
| `surface-raised` | `#15151f` | Recessed wells |
| `elevated` | `#1a1a26` | Hover surface |
| `border-subtle` | `#1e1e2e` | Hairline borders |
| `border-strong` | `#2a2a3d` | Emphasis borders |
| `text-primary` | `#f4f4ff` | Headings, key values |
| `text-secondary` | `#a5a5c4` | Body copy |
| `text-muted` | `#6b6b8a` | Labels, captions |
| **`accent` / `brand`** | **`#00d4ff`** | The single accent — CTAs, identity, active, bars |
| `danger` `#ff5470` · `warning` `#ffb020` · `success` `#28d17c` | | Semantic only |

Category dots (identity only): tech `#00d4ff` · design `#ff6b9d` · business
`#ffd700` · creative `#b07cd6` · gaming `#00ff88` · science `#ff8c00`. Arbitrary
categories get a deterministic bright hue via `getCategory()`.

## Typography — Inter (UI) + JetBrains Mono (numbers, tabular)

Display `.font-display` (heavy italic, used sparingly) · h1 30–36 bold · h2 24–30
bold · h3 18–20 semibold · body 15–16 · caption 11–12 uppercase tracking-wide.

## Radius · Spacing · Shadow

- Radius: `6` controls · `8` (`rounded-lg`) buttons/inputs · `12` (`rounded-xl`) cards · `16` (`rounded-2xl`) prominent · pill for tags.
- Spacing: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96` — larger gaps establish hierarchy.
- Shadow: `card` = `0 1px 2px rgb(0 0 0/.25)` · `lifted` = `0 8px 24px -12px rgb(0 0 0/.55)`. No colored halos.

## CSS variables (globals.css)

```css
:root {
  --color-void: #0a0a0f;   --color-surface: #111118;   --color-elevated: #1a1a26;
  --color-border: #1e1e2e; --color-border-focus: #3a3a5c;
  --color-text-primary: #f4f4ff; --color-text-muted: #6b6b8a;
  --accent-rgb: 0 212 255; /* the single accent — cyan */
}
```

`accent` resolves to `rgb(var(--accent-rgb, 0 212 255) / <alpha>)`. `categoryTheme()`
is a no-op (accent stays cyan); flip it on to re-enable per-tower accents.

## Buttons

Primary `bg-accent-tech text-void font-semibold rounded-lg` (hover `brightness-110`) ·
Secondary `border-border-strong bg-surface` (hover `bg-elevated`) · Ghost `text-muted`→`text-primary`.
All ship default/hover/active/focus/disabled/loading; min target 44px.
