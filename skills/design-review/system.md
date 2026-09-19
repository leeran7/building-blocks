# Design system enforcement

How to verify implementations use the design system correctly.

## Token compliance

- **Colors**: every color value references a semantic token (`text-primary`,
  `bg-surface`, `border-default`). No raw hex, rgb, or hsl.
- **Spacing**: use the spacing scale from the design system. No arbitrary pixel
  values.
- **Typography**: font size, weight, and line height come from type tokens. No
  inline font overrides.
- **Radii and shadows**: use named tokens. No hardcoded `border-radius` or
  `box-shadow` values.

## Responsive

- Base styles target mobile (< 640px). Breakpoints add, never replace.
- Test at: 375px (phone), 768px (tablet), 1280px (desktop).
- No horizontal scroll at any breakpoint.
- Stacking order on mobile must remain logical (heading, content, actions).

## Interaction patterns

- Buttons: primary (one per view), secondary, ghost. Never two primaries.
- Forms: labels above inputs, inline validation, error messages below the field.
- Navigation: consistent placement, current-page indicator, breadcrumbs for
  depth > 2.
- Modals: use sparingly. Confirm only destructive actions. Never nest modals.

## Motion

- Purpose: spatial orientation, state change, hierarchy. Never decoration.
- Duration: 150-300ms for micro-interactions, 300-500ms for page transitions.
- Easing: ease-out for entrances, ease-in for exits.
- `prefers-reduced-motion`: wrap all animations. Fallback is instant state
  change, not frozen animation.
