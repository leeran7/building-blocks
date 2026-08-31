# Roles

Generic jobs. No product facts. Sync to `.cursor/agents/` and `.claude/agents/` — edit here, not there.

**When:** you need to dispatch a `subagent_type` or change a role’s unique Don’t.

**Authoritative:** the named `agents/<role>.md`. `claude.config.json` is Claude tool config only.

## Pipeline (whole-app)

| File | Read when |
|------|-----------|
| `orchestrator.md` | running the loop |
| `product-spec.md` | requirements |
| `architect.md` | contracts |
| `implementer.md` | writing app code |
| `verifier.md` | tests |
| `reviewer.md` | correctness review |
| `security-reviewer.md` | security review |
| `qa-acceptance.md` | AC pass/fail |
| `integrator.md` | CI / PR |
| `release.md` | ship |
| `monitor.md` | post-deploy |
| `curator.md` | last stage: promote findings |

## Specialists (from implementer)

`frontend.md` `backend.md` `data.md` `mobile.md` `design-ux.md` `performance.md` `compliance.md` `cost.md`

Also: `docs.md` `devops.md` `debugger.md`

Open **one** role file. Do not read the roster.
