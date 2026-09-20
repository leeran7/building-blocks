---
name: boy-scout
description: >-
  Boy Scout Rule: leave the code you touch cleaner than you found it. Use
  while implementing a change (deduplicate what you're already touching) and
  as a review checkpoint (confirm it was actually done, scoped, and proven).
---

# Boy Scout Rule

Leave the code you touch cleaner than you found it. This skill is narrowly
about **deduplication**, not a general cleanup license: when a change puts
you inside or next to duplicated logic or markup, remove the duplication in
the same commit instead of adding a third copy.

## When implementing

1. While making the change, notice near-identical logic/markup at the
   call sites you're touching or immediately adjacent to them (same
   conditional, same JSX block, same validation, same query shape repeated
   with only cosmetic differences).
2. Extract it into one shared helper/component and point every site — not
   just the one you were already changing — at it.
3. If the repo has an existing cross-surface reuse pattern (e.g. a `@app/*`
   style alias letting one surface import another's shared source), use it
   instead of inventing a new one or hand-copying the extraction.
4. **Scope discipline**: confine this to files/areas the change already
   touches. Finding unrelated duplication elsewhere in the codebase is not
   an invitation to refactor it in the same change — note it and move on.
5. Prove it the same way any other change is proven: run the full gate
   suite (lint, typecheck, tests) after extracting, and confirm the
   result is either unchanged or intentionally different (e.g. a new test
   file raising the count) — never a silent drop in coverage.
6. When the duplication spans parallel surfaces that must stay in sync
   (e.g. a mobile tree and a web tree implementing the same flow), verify
   the fix landed on every surface, not just the one you started in — a
   partial fix here is worse than the original duplication, because it
   looks fixed.

## Review checkpoint

When reviewing a diff, check specifically:

- [ ] Does the diff sit inside or directly next to duplicated logic/markup
      (not merely "similar-looking" code doing something different)?
- [ ] If yes, was it deduplicated in this change, or left as a third copy?
- [ ] Is the extraction scoped to what the change already touches — no
      speculative refactor of untouched files riding along?
- [ ] If the duplication spans multiple surfaces (mobile/web, two API
      versions, etc.), did the fix land on all of them?
- [ ] Do the gates still pass, with the test count unchanged or explainably
      higher — never lower?

Missed deduplication is a `warning`, not a `critical` finding — it is a
quality/maintainability issue, not a correctness defect. Do not block a
merge on it alone unless the duplication itself is a latent correctness or
security risk (e.g. two copies of a validation rule that can now diverge).
