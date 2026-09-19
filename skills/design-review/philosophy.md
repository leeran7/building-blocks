# Design philosophy

Core principles for evaluating UI decisions. Read before critiquing any design
choice.

## Principles

1. **Clarity over cleverness.** Every element earns its place by reducing
   confusion. If removing it doesn't hurt comprehension, remove it.
2. **Consistency compounds.** Reusing patterns across screens builds muscle
   memory. A novel interaction needs a strong reason.
3. **Mobile-first, always.** Design for the smallest viewport first. Desktop
   adds space; it never rescues a broken mobile layout.
4. **Feedback is mandatory.** Every action the user takes must produce a visible
   response within 100ms. Silence is a bug.
5. **Progressive disclosure.** Show what matters now; reveal complexity on
   demand. Don't front-load every option.

## Process

1. Understand the user's goal — not the feature request, the underlying need.
2. Map the flow: entry point, happy path, edge cases, exit.
3. Design for the worst case first (error, empty, slow network).
4. Validate against real content, not lorem ipsum.

## The bar

Ship when a first-time user can complete the primary task without help text.
If the flow requires an explanation, the flow is the bug.
