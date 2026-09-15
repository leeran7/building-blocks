# Design System & Responsive

## Design System

Build a coherent system before scaling. Define:

**Color** — semantic tokens: background, secondary bg, elevated bg, primary/secondary/tertiary text, accent, success, warning, error, separator. Support light, dark, and accessible contrast. Never rely on color alone to communicate meaning.

**Typography** — display, large title, title, headline, body, callout, subheadline, caption, footnote. Readability over decoration. Use platform-native type where appropriate.

**Spacing** — consistent system, no arbitrary values. Maintain rhythm across screens, components, sections, lists, forms, navigation.

**Components** — define all states (default, pressed, disabled, loading, error, selected, focus/a11y) for: buttons, navigation, cards, lists, inputs, search, tabs, segmented controls, toggles, checkboxes, radio, sheets, modals, alerts, toasts, empty/loading/error states, avatars, badges, progress indicators.

---

## Responsive Design

Never design for one screen size. Consider: small/large phones, dynamic type, orientation, safe areas, keyboard appearance, device cutouts, different text lengths, localization, accessibility settings. Layout adapts — it doesn't just shrink.

---

## Interaction Design

Every interaction needs feedback: press, loading, success, error, empty, progress, navigation. Interactions feel immediate. When an operation takes time, communicate what is happening — never leave users wondering "Did that work?"

---

## Motion Design

Motion communicates cause-and-effect, spatial relationships, state changes, hierarchy, continuity — not decoration.

Prefer: subtle transitions, natural easing, context-preserving movement, gesture-linked motion, meaningful feedback.

Avoid: excessive bouncing, long animations, distracting transitions, animation that delays the user.

Motion feels physical and intentional. Respect `prefers-reduced-motion`.

---

## Microinteractions

Obsess over: button press, pull-to-refresh, successful completion, copy, save, favorite, share, errors, undo, loading, navigation, keyboard. These details create perceived quality.
