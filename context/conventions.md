# Conventions

Match existing code. Do not introduce a second ORM, HTTP client, test
runner, or component library.

- **Package managers** (see `context/profile.json`): `yarn` at repo root
  and in `orchestrator/`; `pnpm` in `app/`. Use the manager for the
  package you are touching. Do not rewrite the other tree’s lockfile.
- **App root** is `app/` (Next.js). Orchestrator runtime is `orchestrator/`.
- **Design:** read `app/DESIGN.md` and `app/tailwind.config.ts` before any
  UI. Never invent a second token set.
- **Tests:** invoke production units and assert output. Do not grep source
  text as proof of behaviour (kernel `skills/closed-loop/gates.md`).
- **Types:** no `any`; `unknown` + narrowing or a named type.
- **Errors:** structured `{ error, code }` at HTTP boundaries; never leak
  stack traces or raw DB messages to clients.
- **Auth effects:** any effect that derives identity from `useAuth()` and
  writes (join, stake, realtime) must gate on `loading` — early-return
  while `authLoading` and include it in deps.
- **Route shape changes:** when changing an API route’s JSON response, grep
  for the client that consumes it — `fetch(...).json()` cast to an interface
  is unchecked by `tsc`, so the page throws at runtime while tests pass.
- **Canvas:** never assign `canvas.width`/`canvas.height` unconditionally in
  an effect — it resizes and clears the bitmap even when the value is
  unchanged. Guard the assignment.
- **Game state:** do not route per-tick simulation state through React state.
  Keep authoritative state in a ref, draw from the rAF callback, publish to
  React only at UI-relevant granularity.
- **Static vs dynamic:** verify Next.js rendering mode from the `next build`
  route table, not by reasoning. A server component awaiting a DB read with
  no `dynamic`/`revalidate` export freezes empty data forever.
