---
name: closed-loop
description: >-
  Orchestrates the closed-loop: spec → architecture → implementation →
  verification → review + security-review → qa-acceptance → integration.
  Use for any scoped product goal — a feature, a visual pass, a fix, or a
  full app — whenever the agent loop should run or multiple subagents should
  coordinate. Works in Cursor, Claude Code, and Codex.
---

# Closed Loop

Run the agent loop from intent to merge-ready code. Scope can be a single
change or a whole product — the team still runs.

**Installing into a new repo?** Read [closed-loop-agents `pack/SETUP.md`](https://github.com/leeran7/closed-loop-agents/blob/main/pack/SETUP.md)
first (file tree + 5-minute install). Repo-specific facts live in
`context/` — agents only point there.

## Before starting

1. Read [stages.md](stages.md) for the stage graph and routing rules.
2. Read [handoffs.md](handoffs.md) for the handoff contract.
3. Read [team.md](team.md) — the orchestrator must actually dispatch the team.
   Impersonating a specialist (doing their work in the parent) is a loop defect.
4. Read [learning-loop.md](learning-loop.md) — the mandatory continuous-learning
   protocol. Every agent reads the learnings ledger before working and records new
   learnings before finishing; the orchestrator runs a retro every iteration.
5. Initialize loop state:

```bash
mkdir -p loop/handoffs
```

Write `loop/state.json`:

```json
{
  "goal": "<user's goal>",
  "currentStage": "software-engineer",
  "iteration": 1,
  "maxIterations": 10,
  "completedStages": [],
  "dispatched": [],
  "requiredTeam": [
    "software-engineer",
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
     (`software-engineer`, not `custom` / `generalPurpose`)
   - **Claude Code**: Agent tool with `subagent_type` matching the agent name
   - **Codex**: Agent tool with `subagent_type` matching the agent name
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
6. **Retro** — after each iteration, collect learnings from handoff arrays,
   promote each to its permanent file per the routing table in
   [learning-loop.md](learning-loop.md), and prune. Surface top findings in
   the stage report.
7. **Repeat** until terminal conditions in stages.md are met or `maxIterations` reached.
8. **Report** — summarize artifacts, PR URL, test results, remaining warnings, and learnings recorded.

## Subagent roster

| Stage | Subagent | When |
|-------|----------|------|
| Loop owner | orchestrator | Coordinate all stages |
| 1 | software-engineer | Spec, architecture, and implementation |
| 2 | verifier | Tests and correctness |
| 3 | reviewer | Code quality review |
| 4 | security-reviewer | Security audit |
| 5 | qa-acceptance | Acceptance criteria validation |
| 6 | integrator | CI green, PR merge-ready |

## Prompt template for each delegation

```
Goal: {goal}
Prior handoff: {json}
Your stage: {stage}

Before starting: read loop/learnings.md for open questions that may affect your
work, and this handoff's `learnings` array. Apply every finding aimed at you
(learning-loop.md).

Complete your stage per your agent definition. Before finishing:
1. Write handoff to loop/handoffs/{stage}-{iso-timestamp}.json
2. Follow the handoff contract in skills/closed-loop/handoffs.md
3. Set nextStage and loopBackTo appropriately
4. Put your learnings in the handoff `learnings` array (the orchestrator retro
   promotes them to their permanent files)
```

## Running the loop

| Platform | How to start |
|----------|--------------|
| **Cursor** | "Use the closed-loop skill to build …" or invoke `@orchestrator` |
| **Claude Code** | `/closed-loop` or "Use the orchestrator agent to build …" |
| **Codex** | `/closed-loop` or "Use the orchestrator agent to build …" |
| **Programmatic** | `yarn loop "Build a todo app"` (Cursor SDK orchestrator) |

## Iteration limits

Default max 10 revision loops. If exceeded, pause and ask the user whether to continue or adjust scope.
