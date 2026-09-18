# UX & design context

Live design tokens are in `paths.design` (see `profile.json`).
Read that file for colors, typography, radius, spacing. Never duplicate
tokens here — this file covers patterns and rules.

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

## Accessibility baseline (WCAG 2.1 AA)

- Contrast: 4.5:1 body text, 3:1 large text and UI controls.
- Keyboard: every interactive element reachable via Tab, activated via Enter/Space.
- Focus visible: always. Use a `ring` token, not browser default.
- ARIA: use semantic HTML first. Add `aria-*` only when native semantics fall short.
- Reduced motion: wrap animations in `prefers-reduced-motion` media query.
- Touch targets: minimum 44×44 CSS px on mobile.

## User flow patterns

- **Entry**: every flow has a discoverable entry point.
- **Empty state**: first-time users see an explanation + primary action.
- **Error recovery**: errors show what went wrong + how to fix it. Include retry.
- **Success next step**: after completion, tell the user what happened and what's next.
- **Loading transitions**: skeleton screens for layout, spinners for actions.
