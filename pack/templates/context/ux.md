# UX & design context

Live design tokens are in `paths.design` (see `profile.json`). Read that file
for colors, typography, radius, spacing. Never duplicate tokens here — this file
covers patterns, principles, and rules.

## Design principles

**Clarity** — one obvious primary purpose per screen; recognition over recall;
progressive disclosure.

**Hierarchy** — establish through typography, scale, spacing, contrast, position,
motion, color, density. The most important action must feel important.

**Simplicity** — remove anything that doesn't help the user, communicate
hierarchy, reinforce the product, or earn its place. Simplicity is not emptiness.

**Human-centered** — design around user goals, context, expectations, thumb
reach, attention, a11y, error recovery, one-handed use, interruption, slow
networks, empty states.

**Platform respect** — follow iOS/Android/web conventions unless there is a
strong product reason not to.

## Visual design bar

Interfaces should feel: premium, calm, intentional, modern, native, sophisticated,
responsive, cohesive.

Avoid: gratuitous gradients, excessive glass effects, random rounded cards,
overuse of shadows, excessive borders, tiny text, visual noise, excessive
animation, decorative UI without purpose, generic layouts.

Use whitespace deliberately. Not every element is a card. Not every element gets
rounded rectangles.

## Component states

Every interactive component must handle all applicable states:

| State | What it means |
|-------|---------------|
| Default | Resting / idle appearance |
| Loading | Async operation in flight — show skeleton or spinner |
| Error | Operation failed — show inline message + retry |
| Empty | No data yet — explain why and offer a primary action |
| Disabled | Interaction blocked — visually muted, cursor not-allowed |
| Active / Selected | Currently engaged — signal highlight |
| Hover / Focus | Pointer or keyboard focus — elevated surface or ring |

Don't ship a component that only handles the happy path.

## Quality bar

Not "It looks nice." — "This feels obvious, effortless, and extremely well made."

## Deep dives

Read these when doing UI work — not required for every task:

| File | When to read |
|------|--------------|
| `context/ux-process.md` | Designing a new screen or flow |
| `context/ux-patterns.md` | Interaction, motion, microinteractions, UX writing |
| `context/ux-accessibility.md` | Accessibility audit, responsive layout, mobile UX |
