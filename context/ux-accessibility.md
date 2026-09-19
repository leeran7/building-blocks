# Accessibility, responsive, & mobile UX

Parent: `context/ux.md`. Read that file first for principles and component states.

## Accessibility (WCAG 2.1 AA)

Not an afterthought. Design for: Dynamic Type, VoiceOver/TalkBack, Reduced
Motion, high contrast, color blindness, motor accessibility, screen reader
hierarchy, semantic labels, keyboard navigation.

- Contrast: 4.5:1 body text, 3:1 large text and UI controls.
- Keyboard: every interactive element reachable via Tab, activated via Enter/Space.
- Focus visible: always. Use a `ring` token, not browser default.
- ARIA: use semantic HTML first. Add `aria-*` only when native semantics fall short.
- Reduced motion: wrap animations in `prefers-reduced-motion` media query.
- Touch targets: minimum 44x44 CSS px on mobile.
- Don't sacrifice accessibility for aesthetics.

## Responsive design

Never design for one screen size. Consider: small/large phones, dynamic type,
orientation, safe areas, keyboard appearance, device cutouts, different text
lengths, localization, accessibility settings. Layout adapts — it doesn't shrink.

Follow breakpoints in `tailwind.config.ts`. Design mobile-first. Test at:
`sm` (640), `md` (768), `lg` (1024), `xl` (1280).

## Mobile UX

Design for touch first. Comfortable touch targets (44x44 min), no precision
required.

Patterns: bottom/tab navigation, sheets, modals, full-screen flows, gestures
(swipe, long press, pull-to-refresh, drag), search/filter, forms, onboarding,
auth, checkout, payments, notifications, settings, profiles, dashboards, feeds,
messaging, media.
