# Conventions

Match existing code. Do not introduce a second ORM, HTTP client, test
runner, or component library.

- **Package managers:** see `context/profile.json`. Use the manager for the
  path you are touching.
- **Design:** if `paths.design` is set, read that file before any UI. Never
  invent a second token set.
- **Tests:** invoke production units and assert output. Do not grep source
  text as proof of behaviour (`skills/closed-loop/gates.md`).
- **Types:** no `any`; `unknown` + narrowing or a named type.
- **Errors:** structured errors at HTTP boundaries; never leak stack traces
  or raw DB messages to clients.
