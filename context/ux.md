# UX & design context

Live design tokens are in `app/DESIGN.md` (`paths.design` in `profile.json`).
Read that file for colors, typography, radius, spacing, and atmosphere. Never
duplicate tokens here — this file covers patterns, principles, and rules.

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

## Design process

1. **Understand the product** — purpose, target users, primary problem, core
   journey, business objective, usage frequency, context, competitive
   alternatives, differentiating value.
2. **Define information architecture** — primary/secondary navigation, content
   hierarchy, screen hierarchy, user flows, entry/exit points.
3. **Map core user flows** — Entry → Orientation → Primary action → Decision
   points → Confirmation → Feedback → Completion → Return. Also cover: errors,
   undo, cancellation, back navigation, interrupted flows, empty states, loading,
   offline, permissions, auth, first-time use.

## Output format (when designing)

1. **Product understanding** — briefly explain the product and assumptions.
2. **User flow** — ideal journey (happy path + inline errors).
3. **Information architecture** — navigation and screen structure.
4. **Screen inventory** — route, entry/exit, auth, primary action.
5. **Screen specifications** — per screen: purpose, layout, content hierarchy,
   primary/secondary actions, interaction behavior, all states, motion, a11y.
6. **Component specs** — all states (default, loading, error, empty, disabled,
   active), keyboard, a11y.
7. **Design system additions** — only when the existing system doesn't cover it.
8. **UX decisions** — explain important choices and why.
9. **Edge cases** — call out explicitly.

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

## Screen states

Every important screen must be evaluated in all states:

| State | Question |
|-------|----------|
| Loading | What does the user see while content loads? |
| Empty | What happens when there is no content? |
| Error | What happened and how can the user recover? |
| Success | How is completion communicated? |
| Offline | What happens without connectivity? |
| Partial | Some content loads, other fails? |
| Permission | How is permission requested and explained? |
| First use | What does a new user see? |
| Returning | What changes for an experienced user? |

## Design system patterns

**Color** — semantic tokens: background, secondary bg, elevated bg,
primary/secondary/tertiary text, accent, success, warning, error, separator.
Support light, dark, and accessible contrast. Never rely on color alone.

**Typography** — readability over decoration. Use platform-native type where
appropriate. See `app/DESIGN.md` for this product's type scale.

**Spacing** — consistent system, no arbitrary values. Maintain rhythm across
screens, components, sections, lists, forms, navigation.

**Components** — define all states (default, pressed, disabled, loading, error,
selected, focus/a11y) for: buttons, navigation, cards, lists, inputs, search,
tabs, segmented controls, toggles, checkboxes, radio, sheets, modals, alerts,
toasts, empty/loading/error states, avatars, badges, progress indicators.

## Accessibility (WCAG 2.1 AA)

Not an afterthought. Design for: Dynamic Type, VoiceOver/TalkBack, Reduced
Motion, high contrast, color blindness, motor accessibility, screen reader
hierarchy, semantic labels, keyboard navigation.

- Contrast: 4.5:1 body text, 3:1 large text and UI controls.
- Keyboard: every interactive element reachable via Tab, activated via Enter/Space.
- Focus visible: always. Use a `ring` token, not browser default.
- ARIA: use semantic HTML first. Add `aria-*` only when native semantics fall short.
- Reduced motion: wrap animations in `prefers-reduced-motion` media query.
- Touch targets: minimum 44×44 CSS px on mobile.
- Don't sacrifice accessibility for aesthetics.

## Responsive design

Never design for one screen size. Consider: small/large phones, dynamic type,
orientation, safe areas, keyboard appearance, device cutouts, different text
lengths, localization, accessibility settings. Layout adapts — it doesn't shrink.

Follow breakpoints in `tailwind.config.ts`. Design mobile-first. Test at:
`sm` (640), `md` (768), `lg` (1024), `xl` (1280).

## Mobile UX

Design for touch first. Comfortable touch targets (44×44 min), no precision
required.

Patterns: bottom/tab navigation, sheets, modals, full-screen flows, gestures
(swipe, long press, pull-to-refresh, drag), search/filter, forms, onboarding,
auth, checkout, payments, notifications, settings, profiles, dashboards, feeds,
messaging, media.

## Interaction design

Every interaction needs feedback: press, loading, success, error, empty,
progress, navigation. Interactions feel immediate. When an operation takes time,
communicate what is happening — never leave users wondering "Did that work?"

## Motion design

Motion communicates cause-and-effect, spatial relationships, state changes,
hierarchy, continuity — not decoration.

Prefer: subtle transitions, natural easing, context-preserving movement,
gesture-linked motion, meaningful feedback.

Avoid: excessive bouncing, long animations, distracting transitions, animation
that delays the user.

Respect `prefers-reduced-motion`.

## Microinteractions

Obsess over: button press, pull-to-refresh, successful completion, copy, save,
favorite, share, errors, undo, loading, navigation, keyboard. These details
create perceived quality.

## UX writing

Short, human, specific, calm, helpful, confident. No corporate jargon, generic
filler, technical language, passive voice, or unnecessary explanations.

Buttons describe the action — not "Continue" but "Create account". Errors
explain: what happened, why (when useful), what the user can do next.

## User flow patterns

- **Entry**: every flow has a discoverable entry point — button, link, or nav.
- **Empty state**: first-time users see explanation + primary action, not blank.
- **Error recovery**: show what went wrong, why, and how to fix. Include retry.
- **Success next step**: after completion, tell the user what happened and what's next.
- **Loading transitions**: skeleton screens for layout, spinners for actions,
  progress bars for uploads.

## Product thinking

Don't blindly execute requests. If a feature creates poor UX, explain why and
propose a better solution. Consider: retention, activation, conversion,
engagement, trust, friction, cognitive load, discoverability, user motivation,
business constraints. Optimize the **experience**, not individual screens.

## Design critique checklist

- [ ] Hierarchy — can users identify what matters?
- [ ] Navigation — can users predict where they'll go?
- [ ] Interaction — does every action have understandable feedback?
- [ ] Consistency — does it match the rest of the product?
- [ ] Accessibility — is it usable for everyone?
- [ ] Density — too much or too little information?
- [ ] Visual quality — polished and intentional?
- [ ] Emotional quality — trustworthy, delightful, calm, powerful?
- [ ] Edge cases — handled gracefully?
- [ ] Primary action is obvious
- [ ] Touch targets are appropriate (44×44 min)
- [ ] Loading / error / empty states are handled
- [ ] Design works for real content, not just placeholder content

## Quality bar

Not "It looks nice." — "This feels obvious, effortless, and extremely well made."
