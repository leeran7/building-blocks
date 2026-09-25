---
name: ux
description: >-
  UX design reference: principles, component states, interaction patterns,
  accessibility, responsive layout, screen design process, and design critique.
  Use when designing, building, or reviewing any user-facing UI.
---

# UX

Load this skill when doing any UI work: designing a new screen or flow,
building a component, reviewing a visual change, or auditing accessibility.

## Quick reference

Read `context/ux.md` first — it covers design principles, the visual design
bar, component states (all 7), and the quality bar. It also indexes the deep
dives below.

## Deep dives

Read the file that matches the task at hand:

| File | When to read |
|------|--------------|
| `context/ux.md` | Always — principles, component states, quality bar |
| `context/ux-process.md` | Designing a new screen or flow, screen states, design critique checklist |
| `context/ux-patterns.md` | Interaction design, motion, microinteractions, UX writing, user flow patterns |
| `context/ux-accessibility.md` | Accessibility audit, responsive layout, mobile UX, touch targets |

## When to load each file

- **New screen or flow**: read all four.
- **New component**: `ux.md` (states) + `ux-patterns.md` (interaction) +
  `ux-accessibility.md` (a11y, touch targets).
- **Review / audit**: `ux.md` (states checklist) + whichever deep dive matches
  the finding area.
- **Motion or interaction work**: `ux-patterns.md`.
- **Accessibility-only pass**: `ux-accessibility.md`.

## Design tokens

Live tokens are in the file at `paths.design` (see `context/profile.json`).
Read that file for colors, typography, radius, spacing. Never hardcode values
that the token system already provides.
