# End-to-end flows (product-spec)

Read this before writing stories. Specs that only list features ship unfinished
products: missing entry points, dead CTAs, empty states with no next step, and
flows nobody would choose to use.

## Flow inventory

For every in-scope capability, write one named flow (F-1…). A story without a
flow is incomplete. A flow without a story is gold-plating — cut it or move it
to Future.

Each flow must answer:

| Question | Spec it as |
|----------|------------|
| Who starts this, and why now? | Persona + trigger (intent, notification, nav, deep link) |
| How do they find it? | Discovery surface(s): nav label, CTA copy, search, URL |
| Where do they land? | Entry route/screen; label destination must match the named mode |
| What must already be true? | Auth, data, permissions, prior steps |
| What is the one job? | Primary outcome in one sentence |
| What do they do, step by step? | Ordered happy path (entry → act → confirm → next) |
| What if nothing is there yet? | Empty / first-run / zero-state + the recovery action |
| What goes wrong? | At least one failure path with user-visible recovery |
| How does it end well? | Success state + obvious next action (not a dead end) |
| How do they come back? | Return / resume / undo / history if relevant |

## Utilization (best way to use the flow)

Do not stop at “the feature exists.” Decide the **best default path** a
competent user should take:

1. **Primary path** — the shortest route that delivers the outcome. Spec that
   path first; secondary paths are alternatives, not peers.
2. **Defaults** — prefill, suggested next step, or sensible empty → guided
   create. Prefer one clear action over a menu of equal options.
3. **Progressive disclosure** — advanced/rare controls after the primary job,
   not competing on first paint.
4. **Cross-surface honesty** — every label, teaser, and nav item that names the
   flow must land on the playable/usable surface, not a dead excerpt.
5. **Finish the loop** — after success, say what changed and offer the natural
   next step (continue, share, return home). After failure, offer retry or exit.

If two designs both satisfy the ACs, pick the one that makes the primary path
obvious without a tutorial. Record the choice in the flow notes so architect and
design-ux do not reverse it.

## Finishing-touch checklist (reject the spec if any fail)

- [ ] Every in-scope flow has discovery → entry → happy path → success next step
- [ ] Every critical flow has empty/first-run and at least one failure recovery
- [ ] Nav/CTA copy that names a mode links to that mode’s real surface
- [ ] Mid-flow abandon, refresh, and double-submit have defined behavior
- [ ] No success screen is a dead end; no empty state is only “nothing here”
- [ ] Out-of-scope finishing work is listed under Future with a one-line why

## Spec shape

Under **Flows**, list F-n with: trigger, discovery, entry, preconditions, steps,
empty, failure, success next, utilization note. Map each story to its F-n.
Acceptance criteria must cover the happy path, the empty/first-run case, and
one negative path for each critical flow — not only the capability in isolation.
