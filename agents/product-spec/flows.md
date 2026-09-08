# End-to-end flows (product-spec)

Read this before writing stories. Specs that only list features ship unfinished
products: missing entry points, dead CTAs, empty states with no next step, and
flows nobody would choose to use.

## Critical vs secondary

Every in-scope F-n must declare **`critical: yes` or `critical: no`**.

- **Critical** (default): the primary job of the change, money/score/auth paths,
  or any flow named in nav/CTA. Empty/first-run, failure recovery, negative ACs,
  and mid-flow abandon/refresh/double-submit are required.
- **Secondary**: supporting or rare paths. Still need discovery → entry → happy
  path → success next. Empty/failure may be `N/A` with a one-line reason.

If unsure, mark **critical**.

## Flow inventory

For every in-scope capability, write one named flow (F-1…). A story without a
flow is incomplete. A flow without a story is gold-plating — cut it or move it
to Future.

Each flow must answer:

| Question | Spec it as |
|----------|------------|
| Critical? | `critical: yes` \| `no` (see above) |
| Who starts this, and why now? | Persona + trigger (intent, notification, nav, deep link) |
| How do they find it? | Discovery surface(s): nav label, CTA copy, search, URL |
| Where do they land? | Entry route/screen; label destination must match the named mode |
| What must already be true? | Auth, data, permissions, prior steps |
| What is the one job? | Primary outcome in one sentence |
| What do they do, step by step? | Ordered happy path (entry → act → confirm → next) |
| What if nothing is there yet? | Empty / first-run / zero-state + recovery — or `N/A` + reason if secondary |
| What goes wrong? | Failure path + user-visible recovery — or `N/A` + reason if secondary |
| How does it end well? | Success state + obvious next action (not a dead end) |
| How do they come back? | Return / resume / history if relevant. **Undo** only for reversible UI/session state — never for irreversible or money-adjacent writes (`context/trust.md`) |
| Mid-flow interrupt? | Abandon, refresh, double-submit — required when `critical: yes` |

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
obvious without a tutorial. Record the choice in the flow notes so the
implementer and frontend do not reverse it.

## Finishing-touch checklist (reject the spec if any fail)

- [ ] Every F-n declares `critical: yes|no`
- [ ] Every in-scope flow has discovery → entry → happy path → success next step
  and a utilization note (primary path)
- [ ] Every **critical** flow has empty/first-run, failure recovery, and defined
  abandon / refresh / double-submit (ACs or explicit N/A with reason)
- [ ] Nav/CTA copy that names a mode links to that mode’s real surface
- [ ] No success screen is a dead end; no empty state is only “nothing here”
- [ ] Auth-gated or trust-boundary flows (`context/trust.md`: money, score,
  admin, irreversible writes) include unauthorized/unauthenticated failure ACs
  and server/provider-derived state — not client-trusted undo
- [ ] Out-of-scope finishing work is listed under Future with a one-line why

## Spec shape

Under **Flows**, list F-n with: criticality, trigger, discovery, entry,
preconditions, steps, empty, failure, success next, mid-flow interrupt,
utilization note. Map each story to its F-n. For each **critical** flow,
acceptance criteria must cover: happy path, empty/first-run, one negative path,
and mid-flow interrupt (or N/A with reason) — not only the capability in
isolation.
