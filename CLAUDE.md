# Building Blocks — Closed Loop Agents

Multi-agent system for building apps autonomously. Works in **Cursor** and **Claude Code**.

## Quick start (Claude Code)

```
/closed-loop
```

Or invoke the orchestrator directly:

```
Use the orchestrator agent to run the closed loop: Build a todo app with auth
```

You can also @-mention any agent: `@implementer`, `@reviewer`, `@verifier`, etc.

## Agent locations

| Platform | Agents | Skills |
|----------|--------|--------|
| Claude Code | `.claude/agents/` | `.claude/skills/closed-loop/` (`/closed-loop`) |
| Cursor | `.cursor/agents/` | `.cursor/skills/closed-loop/` |
| Source of truth | `agents/` | `skills/closed-loop/` |

Edit files in `agents/` or `skills/`, then run `yarn sync` to regenerate platform-specific copies.

## Loop runtime

Shared runtime artifacts live in `loop/` (not platform-specific):

- `loop/state.json` — current stage and iteration
- `loop/handoffs/` — JSON handoffs between agents
- `loop/spec.md`, `loop/architecture.md`, etc. — stage outputs
- `loop/learnings.md` + `loop/learnings.jsonl` — **persistent cross-agent memory.**
  Every agent reads it before working and records findings after; the orchestrator
  runs a retro each iteration that folds learnings in and promotes recurring ones to
  standing rules. Never deleted between runs. See `skills/closed-loop/learning-loop.md`.

## ⚠️ Standing rule — always review with agents

Do **not** ship substantial changes on inline work alone. After any meaningful
code change, and always before deploying, dispatch the relevant review agents
(usually in parallel) to catch bugs, security issues, and bad practices:

- **security-reviewer** — auth, secrets, injection, open redirects, dependencies, OWASP
- **reviewer** — correctness, edge cases, maintainability, conventions
- **frontend** — UI/UX, accessibility (WCAG AA), all-states, responsive, contrast
- **debugger** — root-cause a failing test / runtime bug before patching

Agents are read-mostly reviewers (`reviewer`, `security-reviewer`) or can edit
(`implementer`, `debugger`, `frontend`, `integrator`). Run reviewers to find,
then fix (yourself or via `implementer`/`debugger`), then re-verify.

## Full agent roster

**Pipeline:** product-spec → architect → implementer → verifier → reviewer → security-reviewer → qa-acceptance → integrator → release → monitor

**Support:** orchestrator, debugger, devops, docs

**Specialists:** frontend, backend, data, mobile, design-ux, performance, compliance, cost

## Agents — when to use each

| Agent | Use it when… | Can edit? |
|-------|--------------|-----------|
| **orchestrator** | Running the full build loop / coordinating stages autonomously | yes |
| **product-spec** | Turning intent into a PRD + testable acceptance criteria (first stage) | writes docs |
| **architect** | Choosing stack, boundaries, data models, API contracts, folder structure | writes docs |
| **implementer** | Writing app code to spec; applying fixes from review/CI/debug feedback | yes |
| **frontend** | UI-heavy work — components, pages, routing, client state, a11y (+ design) | yes |
| **backend** | APIs, business logic, auth middleware, server-side validation | yes |
| **data** | Schemas, migrations, query optimization, seed data | yes |
| **mobile** | Native / cross-platform mobile UI + API integration | yes |
| **design-ux** | Dedicated design phase before implementation (wireframes, tokens, flows) | writes docs |
| **verifier** | Writing/running unit·integration·e2e tests; validating against ACs | yes |
| **reviewer** | Reviewing a diff for correctness, edge cases, conventions | read-only |
| **security-reviewer** | Auditing auth, secrets, injection, redirects, deps, OWASP | read-only |
| **qa-acceptance** | Validating user flows against acceptance criteria | yes |
| **debugger** | Root-causing test failures, CI errors, runtime crashes, flakiness | yes |
| **integrator** | Keeping the branch merge-ready — conflicts, CI, review triage | yes |
| **performance** | Profiling bundle size, query perf, latency; perf NFRs/regressions | yes |
| **devops** | CI/CD pipelines, env config, IaC, deployment infra | yes |
| **compliance** | GDPR/SOC2, audit trails, retention, privacy NFRs | read-only |
| **cost** | Cloud spend, query efficiency, resource sizing | read-only |
| **release** | Versioning, changelogs, deployment, rollout | yes |
| **monitor** | Post-deploy observability — errors, latency, uptime, alerts | read-only |
| **docs** | README, API docs, setup guides, runbooks | writes docs |

**Typical review fan-out for a normal change:** `reviewer` + `security-reviewer`
(+ `frontend` if UI). For a whole-app build: run the pipeline via `orchestrator`.

## Handoff contract

Every agent writes `loop/handoffs/<agent>-<timestamp>.json` before finishing. See `skills/closed-loop/handoffs.md`.

## Programmatic loop (Cursor SDK)

```bash
export CURSOR_API_KEY="cursor_..."
yarn loop "Build a todo app with JWT auth"
```

## Sync after edits

```bash
yarn sync
```
