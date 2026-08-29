# Closed Loop Stages

## Primary loop (always run)

```
product-spec → architect → implementer → verifier
                                              ↓
                        reviewer + security-reviewer (parallel)
                                              ↓
                         qa-acceptance → integrator → release
                                    ↑         ↑          ↑
                                    └─────────┴──────────┘
                                              (failures loop back)
```

## Parallel quality gates (after verifier)

The orchestrator must dispatch these — doing the review in the parent does not count.

Run `reviewer` and `security-reviewer` in the **same message** (parallel). Then
`qa-acceptance`. All must pass before integrator:

- **reviewer** — correctness, edge cases, conventions (critical findings block)
- **security-reviewer** — auth, secrets, injection, dependencies
- **qa-acceptance** — user flows vs acceptance criteria
- **performance** — only when perf criteria exist in spec

`nextStage` on a handoff cannot skip a required team member. The orchestrator
clamps skips back onto the sequence (see [team.md](team.md)).

## Conditional stages

| Trigger | Agent |
|---------|-------|
| Test or CI failure with unclear cause | debugger |
| Frontend-heavy work | frontend (delegated from implementer) |
| API/backend work | backend |
| Schema or migration work | data |
| Mobile client | mobile |
| UI/UX requirements in spec | design-ux (before implementer) |
| Compliance requirements in spec | compliance |
| Cloud/infra changes | devops |
| Post-deploy | monitor |
| Missing docs | docs |

## Specialist delegation

Implementer delegates to specialists but owns integration. Specialists write their own handoffs tagged `"parent": "implementer"`.

## Terminal conditions

The orchestrator stops the loop when ALL are true:

1. Verifier status is `success`
2. Reviewer has no critical feedback
3. Security-reviewer has no critical findings
4. QA acceptance criteria all pass
5. Integrator reports CI green and PR merge-ready
6. Release stage completes (or skipped for local-only apps)

## Loop-back routing

| Failure source | Route to |
|----------------|----------|
| Verifier test failures | implementer |
| Reviewer critical findings | implementer |
| Security critical findings | implementer |
| QA acceptance failures | implementer (or product-spec if spec is wrong) |
| CI failures in PR scope | implementer |
| CI failures unrelated to PR | integrator (merge base first) |
| Flaky/unclear failures | debugger → implementer |
| Production alerts | monitor → orchestrator → implementer |

## Platform delegation

| Platform | Delegate to subagent |
|----------|---------------------|
| Cursor | Task tool with `subagent_type` **equal to the agent name** |
| Claude Code | Agent tool with `subagent_type` matching the agent name |

`custom` / `generalPurpose` / implementing the stage yourself is a loop defect.
See [team.md](team.md).
