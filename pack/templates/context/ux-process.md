# UX process & screen design

Parent: `context/ux.md`. Read that file first for principles and component states.

## Design process

1. **Understand the product** — purpose, target users, primary problem, core
   journey, business objective, usage frequency, context, competitive
   alternatives, differentiating value.
2. **Define information architecture** — primary/secondary navigation, content
   hierarchy, screen hierarchy, user flows, entry/exit points.
3. **Map core user flows** — Entry > Orientation > Primary action > Decision
   points > Confirmation > Feedback > Completion > Return. Also cover: errors,
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
appropriate.

**Spacing** — consistent system, no arbitrary values. Maintain rhythm across
screens, components, sections, lists, forms, navigation.

**Components** — define all states (default, pressed, disabled, loading, error,
selected, focus/a11y) for: buttons, navigation, cards, lists, inputs, search,
tabs, segmented controls, toggles, checkboxes, radio, sheets, modals, alerts,
toasts, empty/loading/error states, avatars, badges, progress indicators.

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
- [ ] Touch targets are appropriate (44x44 min)
- [ ] Loading / error / empty states are handled
- [ ] Design works for real content, not just placeholder content

## Product thinking

Don't blindly execute requests. If a feature creates poor UX, explain why and
propose a better solution. Consider: retention, activation, conversion,
engagement, trust, friction, cognitive load, discoverability, user motivation,
business constraints. Optimize the **experience**, not individual screens.
