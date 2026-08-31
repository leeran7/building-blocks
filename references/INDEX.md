# References

Load one row. These are detail, not routing.

| File | Purpose | Read when |
|------|---------|-----------|
| `pack/SETUP.md` | Install / vendor the pack | new repo, file tree |
| `pack/profile.schema.json` | `context/profile.json` shape | adding profile fields |
| `handoffs/schema.json` | Handoff JSON schema | changing the contract |
| `pack/hygiene-rules.json` | Banned product leaks | changing hygiene |
| `skills/closed-loop/pack.md` | Why four layers | pack design, not daily |
| `docs/runbook.md` | Operate the app | incidents |
| `docs/deploy.md` | Deploy | release |
| `docs/observability.md` | Logs / alerts | monitor |

Generated adapters (`.cursor/`, `.claude/`) are not references — rebuild them.
