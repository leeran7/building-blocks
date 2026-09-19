# Design review skill

Verify UI implementations against the design system and UX standards. Use this
skill when reviewing components, screens, or flows that have a visual output.

## Checklist

Run each check against every changed component or screen in the diff.

### 1. Component states

Every interactive component must handle all 7 states from `context/ux.md`:
default, loading, error, empty, disabled, active/selected, hover/focus.

Flag any component that only handles the happy path.

### 2. Accessibility (WCAG 2.1 AA)

- Contrast: 4.5:1 body text, 3:1 large text and UI controls
- Touch targets: minimum 44x44 CSS px on mobile
- Focus visible: ring token, not browser default
- Keyboard: every interactive element reachable via Tab, activated via Enter/Space
- ARIA: semantic HTML first, aria-* only when native semantics fall short
- Reduced motion: animations wrapped in `prefers-reduced-motion`

### 3. Design tokens

- All colors, spacing, radii, and typography use tokens from `paths.design`
- No hardcoded hex values, pixel spacing, or font sizes outside the token system
- Semantic token names used (e.g., `text-primary` not `gray-900`)

### 4. Responsive

- Component renders correctly at sm (640), md (768), lg (1024), xl (1280)
- Mobile-first: base styles are mobile, breakpoints add desktop behavior
- No horizontal scroll at any breakpoint
- Touch targets remain 44x44 on mobile breakpoints

### 5. Screen states

Every screen must handle: loading, empty, error, success, first use.

- Loading: skeleton or spinner (not blank)
- Empty: explanation + primary action (not blank)
- Error: what happened + how to recover + retry
- Success: confirmation + what's next

### 6. Interaction feedback

Every user action must have visible feedback:
- Button press: visual state change
- Form submit: loading indicator
- Success: confirmation message or transition
- Error: inline message at the point of failure

### 7. Motion

- Animations serve a purpose (spatial, state, hierarchy) — not decoration
- Duration appropriate (150-300ms for micro, 300-500ms for transitions)
- `prefers-reduced-motion` respected

## Severity

| Level | When |
|-------|------|
| critical | Missing accessibility (no focus, no keyboard, contrast fail) |
| critical | Component has zero error/empty/loading handling |
| warning | Hardcoded tokens, missing one screen state |
| info | Motion could be improved, minor spacing inconsistency |
