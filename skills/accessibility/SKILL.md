---
name: accessibility
description: >-
  WCAG 2.1 AA compliance and inclusive design. Semantic HTML, keyboard
  navigation, screen readers, color contrast, and ARIA. Use when building or
  reviewing UI components, forms, or interactive flows.
---

# Accessibility Skill

Accessibility is not a feature — it's a quality bar. Every interactive element
must work for every user, regardless of how they navigate.

## Semantic HTML first

Use the right element before reaching for ARIA:

| Need | Use | Not |
|------|-----|-----|
| Navigation | `<nav>` | `<div class="nav">` |
| Button | `<button>` | `<div onClick>` |
| Link | `<a href>` | `<span onClick>` |
| List | `<ul>/<ol>` | `<div>` with CSS bullets |
| Heading | `<h1>`-`<h6>` | `<div class="title">` |
| Form field | `<input>` + `<label>` | `<div contenteditable>` |

ARIA is a patch for when HTML semantics don't exist. If a native element does
the job, use it.

## Keyboard navigation

Every interactive element must be:

1. **Reachable** via Tab (or arrow keys within a group).
2. **Activatable** via Enter or Space.
3. **Escapable** — modals, dropdowns, and popovers close on Escape.
4. **Visible** when focused — never `outline: none` without a replacement.

Focus order must match visual reading order. If Tab jumps erratically, the
DOM order is wrong.

### Focus management

- After opening a modal, move focus to the modal (first focusable element or
  the modal container with `role="dialog"`).
- After closing a modal, return focus to the element that opened it.
- After deleting an item from a list, move focus to the next item or the
  list container.
- After a route change in a SPA, move focus to the main content or announce
  the new page.

## Color and contrast

- **Text**: 4.5:1 contrast ratio (WCAG AA). Use a contrast checker, not
  your eyes.
- **Large text** (18px+ or 14px+ bold): 3:1 minimum.
- **UI controls** (borders, icons, focus rings): 3:1 against adjacent color.
- **Never use color alone** to convey meaning. Add an icon, pattern, or text
  label. A red/green status indicator is invisible to 8% of men.

## Screen readers

- Every `<img>` needs `alt` text. Decorative images get `alt=""`.
- Form inputs need associated `<label>` elements (use `htmlFor`/`for`, not
  wrapper-only).
- Dynamic content updates use `aria-live="polite"` (or `"assertive"` for
  errors).
- Icon-only buttons need `aria-label` describing the action, not the icon.
- Tables need `<th>` with `scope` attributes.

## Forms

- Labels above inputs, not as placeholders (placeholders disappear on focus).
- Error messages reference the specific field and the fix needed.
- Required fields marked with both visual indicator and `aria-required`.
- Group related fields with `<fieldset>` and `<legend>`.
- Inline validation appears on blur, not on every keystroke.

## Touch targets

- Minimum 44x44 CSS pixels for all interactive elements on mobile.
- Adequate spacing between targets to prevent mis-taps.
- No hover-only interactions — touch devices don't hover.

## Motion

- Wrap all animations in `prefers-reduced-motion` media query.
- Reduced-motion fallback is an instant state change, not a frozen animation.
- No auto-playing video or animation without a pause control.
- No content that flashes more than 3 times per second.

## Testing

- Tab through every page without a mouse.
- Run with a screen reader (VoiceOver, NVDA) at least once per feature.
- Check contrast with a browser dev tools audit.
- Zoom to 200% — layout must remain usable with no horizontal scroll.
- Test with browser high-contrast mode enabled.

## Don't

- Add `role` to an element that already has the right semantics
- Use `tabindex` > 0 (it breaks natural tab order)
- Hide content with `display: none` when screen readers should read it
  (use `sr-only` / visually-hidden pattern instead)
- Disable focus styles without providing a visible alternative
- Assume "we'll add accessibility later" — it's 10x harder to retrofit
