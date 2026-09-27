# Building Blocks

Product repo for **The Climb** / paid stacks (`app/`). Agent roles, skills, and
the kernel protocol are **owned by the [closed-loop-agents](https://github.com/leeran7/closed-loop-agents)
package** — this repo only installs it and supplies its own facts in `context/`.

| | Path |
|--|------|
| This product's facts | [`context/README.md`](context/README.md) |
| Agent roles, skills, kernel protocol | `node_modules/closed-loop-agents` (installed dependency) |
| Source of truth for agents/skills | [leeran7/closed-loop-agents](https://github.com/leeran7/closed-loop-agents) |
| Memory | `loop/learnings.md` |

Do **not** add an `agents/` or `skills/` directory here — that would silently
override the package (see "local overrides" in the package's own
`pack/SETUP.md`) instead of changing the shared roster. To change a role,
its tools, or a skill, edit it in `closed-loop-agents` and land it there;
this repo picks it up on its next `yarn upgrade closed-loop-agents`.

After installing or updating the dependency, run `yarn sync` to regenerate
`.cursor/`, `.claude/`, `.codex/`, and `.agents/` from it plus this repo's
own `context/`. Run `yarn hygiene` before committing agent-adjacent changes
(lints the package's own source, not anything in this repo).

New skills: follow the `create-skill` skill (`skills/create-skill/SKILL.md`).
Shared files between skills **must** be symlinks, never copies — single source
of truth.

## When to use the orchestrator

Assess every task before starting. Use the full closed-loop pipeline
(`@orchestrator` / `/closed-loop`) when the task is **substantial**:

| Use orchestrator | Handle directly |
|-----------------|-----------------|
| New features or flows | Typo / comment / formatting fixes |
| Refactors touching >3 files | Single-file bug fix with obvious cause |
| Security-sensitive changes | Config changes (env, deps, CI) |
| Architecture or API changes | Questions, research, explanations |
| >50 LOC of new code | Renaming or moving a symbol |
| Anything touching auth, payments, or trust boundaries | Updating docs to match existing code |

When in doubt, use the orchestrator — it is cheaper to over-verify than to
ship a regression. The user can always say "just do it directly" to skip.

The orchestrator coordinates the 6 required agents:

```mermaid
graph LR
  SE([software-engineer]) --> V([verifier])

  V --> R([reviewer])
  V --> SR([security-reviewer])

  R --> QA([qa-acceptance])
  SR --> QA

  QA --> INT([integrator])

  R -. "critical findings" .-> SE
  SR -. "critical findings" .-> SE
  V -. "test failures" .-> SE
  QA -. "acceptance failures" .-> SE

  style SE fill:#1e1c24,stroke:#cbf24d,color:#f4f2ec
  style V fill:#1e1c24,stroke:#cbf24d,color:#f4f2ec
  style R fill:#1e1c24,stroke:#a8a4b2,color:#f4f2ec
  style SR fill:#1e1c24,stroke:#a8a4b2,color:#f4f2ec
  style QA fill:#1e1c24,stroke:#a8a4b2,color:#f4f2ec
  style INT fill:#1e1c24,stroke:#cbf24d,color:#f4f2ec
```

<details><summary>Text version</summary>

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     ORCHESTRATOR                        │
                    │                                                         │
                    │        ┌───────────────────┐                            │
                    │        │ software-engineer  │◀─────────────────────┐    │
                    │        └────────┬──────────┘                      │    │
                    │                 │                                  │    │
                    │                 ▼                                  │    │
                    │          ┌───────────┐                             │    │
                    │          │ verifier  │─────────────────────────────┤    │
                    │          └─────┬─────┘                             │    │
                    │       ┌────────┼─────────┐                        │    │
                    │       ▼                   ▼                        │    │
                    │  ┌───────────┐     ┌──────────┐                   │    │
                    │  │ reviewer  │──┐  │ security- │                  │    │
                    │  └───────────┘  │  │ reviewer  │                  │    │
                    │                 │  └─────┬─────┘                  │    │
                    │                 ▼        │       findings / failures    │
                    │          ┌──────────────┐│                        │    │
                    │          │qa-acceptance │◀┘                       │    │
                    │          └──────┬───────┘                         │    │
                    │                 │  · · · · · · · · · · · · · · · ·┘    │
                    │                 ▼                                      │
                    │          ┌───────────┐                                 │
                    │          │integrator │                                 │
                    │          └───────────┘                                 │
                    └─────────────────────────────────────────────────────────┘

  ──▶  forward flow        · · · ·  loop-back (critical findings / failures)
```

</details>

Fix critical findings and re-run until `status: success`. The orchestrator
retro promotes read-only agents' `learnings` to their permanent files.

Product facts go in `context/` or the ledger. Kernel-generic `[all]` lessons
are proposed for `skills/closed-loop/gates.md`. Keep each agent markdown file
under 200 lines.

Git remotes and branch policy: `context/git.md`. Package managers and
gates: `context/profile.json` and `context/gates.json`.
