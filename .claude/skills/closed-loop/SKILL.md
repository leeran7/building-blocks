---
name: closed-loop
description: >-
  Orchestrates the closed-loop: spec → architecture → implementation →
  verification → review → CI → release → monitor. Use for any scoped product
  goal — a feature, a visual pass, a fix, or a full app — whenever the agent
  loop should run or multiple subagents should coordinate. Works in Cursor
  and Claude Code.
---

# Closed Loop

Run the agent loop from intent to merge-ready code. Scope can be a single
change or a whole product — the team still runs.

**Installing into a new repo?** Read [`pack/SETUP.md`](pack/SETUP.md)
first (file tree + 5-minute install). Repo-specific facts live in
`context/` — agents only point there.

## Before starting

1. Read [stages.md](stages.md) for the stage graph and routing rules.
2. Read [handoffs.md](handoffs.md) for the handoff contract.
3. Read [team.md](team.md) — the orchestrator must actually dispatch the team.
   Impersonating a specialist (doing their work in the parent) is a loop defect.
4. Read [learning-loop.md](learning-loop.md) — the lightweight memory: agents
   read the top of `loop/learnings.md` before working and, only when they hit
   something new, add one concise entry to their handoff `learnings` array.
5. Initialize loop state:

```bash
mkdir -p loop/handoffs
```

Write `loop/state.json`:

```json
{
  "goal": "<user's goal>",
  "currentStage": "product-spec",
  "iteration": 1,
  "maxIterations": 10,
  "completedStages": [],
  "dispatched": [],
  "requiredTeam": [
    "product-spec",
    "implementer",
    "verifier",
    "reviewer",
    "security-reviewer",
    "qa-acceptance",
    "integrator"
  ],
  "status": "running"
}
```

## Orchestration workflow

1. **Read state** — load `loop/state.json`, the latest handoff for the current
   stage (including its `learnings` array), and `loop/learnings.md`.
2. **Delegate** — invoke the subagent matching `currentStage`:
   - **Cursor**: Task tool with `subagent_type` matching the agent name
     (`product-spec`, not `custom` / `generalPurpose`)
   - **Claude Code**: Agent tool with `subagent_type` matching the agent name
   - Record the agent on `loop/state.json` `dispatched`
   - **Never do that stage's work in the orchestrator turn**
3. Pass the user goal, prior handoff contents, and handoff write instructions.
4. **Evaluate handoff** — read the new handoff file:
   - `success` → append stage to `completedStages`, set `currentStage` to `nextStage`
     (the orchestrator **clamps** `nextStage` so required team members cannot be skipped)
   - `needs_revision` → increment `iteration`, set `currentStage` to `loopBackTo`
   - `blocked` or `failed` → set state `status` to paused, report to user
   - **File missing** → `failed` (not success). The team member did not run.
5. **Quality gates** — after verifier succeeds, run `reviewer` **and**
   `security-reviewer` in the same message (parallel), then `qa-acceptance`,
   before integrator. Never skip these gates.
6. **Record** — append any new handoff `learnings` to the `loop/learnings.md`
   Notes section (deduped, capped). No fold or promotion algorithm; occasionally
   hand-promote a recurring Note to a Standing rule (see
   [learning-loop.md](learning-loop.md)).
7. **Repeat** until terminal conditions in stages.md are met or `maxIterations` reached.
8. **Report** — summarize artifacts, PR URL, test results, remaining warnings, and learnings recorded.

## Subagent roster

| Stage | Subagent | When |
|-------|----------|------|
| Loop owner | orchestrator | Coordinate all stages |
| 1 | product-spec | Turn intent into end-to-end flows + requirements |
| 2 | implementer | Design contracts inline, then write application code (owns server, data, perf) |
| 3 | verifier | Tests and correctness |
| 4 | reviewer | Code quality review |
| 5 | security-reviewer | Security audit |
| 6 | qa-acceptance | Acceptance criteria validation |
| 7 | integrator | CI green, PR/stack merge-ready (owns GitHub platform strategy) |
| — | debugger | Root-cause unclear failures (conditional) |

Specialist (delegated from implementer): **frontend** — UI + inline design.

## Prompt template for each delegation

```
Goal: {goal}
Prior handoff: {json}
Your stage: {stage}

Before starting: read the top of loop/learnings.md (Standing rules + Notes for
you or `all`) and this handoff's `learnings` array. Apply what fits.

Complete your stage per your agent definition. Before finishing:
1. Write handoff to loop/handoffs/{stage}-{iso-timestamp}.json
2. Follow the handoff contract in skills/closed-loop/handoffs.md
3. Set nextStage and loopBackTo appropriately
4. Only if you hit something genuinely new, add one concise entry to the handoff
   `learnings` array. The orchestrator records it — you never write the ledger.
```

## Running the loop

| Platform | How to start |
|----------|--------------|
| **Cursor** | "Use the closed-loop skill to build …" or invoke `@orchestrator` |
| **Claude Code** | `/closed-loop` or "Use the orchestrator agent to build …" |
| **Programmatic** | `yarn loop "Build a todo app"` (Cursor SDK orchestrator) |

## Iteration limits

Default max 10 revision loops. If exceeded, pause and ask the user whether to continue or adjust scope.
