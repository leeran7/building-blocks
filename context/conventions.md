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
