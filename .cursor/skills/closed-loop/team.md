# Team dispatch contract

The orchestrator **runs the team**. It does not impersonate the team.

## What "running the team" means

A stage counts as run only when **all** of these are true:

1. The orchestrator dispatched that agent via Task / Agent with
   `subagent_type` **exactly equal** to the agent name
   (`product-spec`, `architect`, `implementer`, `verifier`, `reviewer`,
   `security-reviewer`, `qa-acceptance`, `integrator`, …).
2. That agent wrote `loop/handoffs/<agent>-<timestamp>.json`.
3. The orchestrator **read** that handoff before advancing.

Doing the work in the parent conversation does **not** count.
Using `subagent_type: "custom"` or `"generalPurpose"` (or Claude Code
without `subagent_type`) does **not** count.

## Required team (cannot skip)

```
product-spec → architect → implementer → verifier
                                              ↓
                          reviewer + security-reviewer (same message, parallel)
                                              ↓
                                       qa-acceptance → integrator
```

Release and monitor still run after integrator (default sequence). Optional
inserts: `design-ux` after architect; `devops` / `docs` after integrator.

Specialists (`frontend`, `backend`, `data`, `mobile`, …) are **not**
pipeline stages. The implementer may delegate to them with matching
`subagent_type` and still owns the implementer handoff.

## Missing handoff

If the handoff file is absent when the subagent returns, the stage
**failed**. Never treat that as success and never advance.

## Quality gates

After verifier succeeds, dispatch `reviewer` and `security-reviewer` in
**one message** (two Task calls). Both must pass before `qa-acceptance`.
Critical items in `findings` **or** `feedback` (or
`exitCriteria.no_critical_findings === false`) → `needs_revision` →
implementer. `loopBackTo` is clamped to product-spec / architect /
implementer / debugger — never forward to integrator or release.

## Prompt-loop vs programmatic loop

| Path | How the team is dispatched |
|------|---------------------------|
| `@orchestrator` / `/closed-loop` | Task / Agent with matching `subagent_type` |
| `yarn loop` | One Cursor SDK agent per stage (reviewer + security-reviewer in parallel) |

Both paths share this contract, `loop/state.json` `dispatched` / `requiredTeam`,
and the same handoff directory: `loop/handoffs/`.
