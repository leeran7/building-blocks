---
name: closed-loop
description: >-
  Orchestrates the full closed-loop app build: spec → architecture →
  implementation → verification → review → CI → release → monitor. Use when
  building an entire app autonomously, running the agent loop, or coordinating
  multiple subagents in sequence. Works in Cursor and Claude Code.
---

# Closed Loop App Builder

Run the full agent loop to build an app from intent to merge-ready code.

## Before starting

1. Read [stages.md](stages.md) for the stage graph and routing rules.
2. Read [handoffs.md](handoffs.md) for the handoff contract.
3. Read [learning-loop.md](learning-loop.md) — the mandatory continuous-learning
   protocol. Every agent reads the learnings ledger before working and records new
   learnings before finishing; the orchestrator runs a retro every iteration.
4. Initialize loop state:

```bash
mkdir -p loop/handoffs
```

Write `loop/state.json`:

```json
{
  "goal": "<user's app goal>",
  "currentStage": "product-spec",
  "iteration": 1,
  "maxIterations": 10,
  "completedStages": [],
  "status": "running"
}
```

## Orchestration workflow

1. **Read state** — load `loop/state.json`, the latest handoff for the current
   stage (including its `learnings` array), and `loop/learnings.md`.
2. **Delegate** — invoke the subagent matching `currentStage`:
   - **Cursor**: Task tool with `subagent_type` matching the agent name
   - **Claude Code**: Agent tool with `subagent_type` matching the agent name, or `@agent-name` mention
3. Pass the user goal, prior handoff contents, and handoff write instructions.
4. **Evaluate handoff** — read the new handoff file:
   - `success` → append stage to `completedStages`, set `currentStage` to `nextStage`
   - `needs_revision` → increment `iteration`, set `currentStage` to `loopBackTo`
   - `blocked` or `failed` → set state `status` to paused, report to user
5. **Quality gates** — after verifier succeeds, run security-reviewer and qa-acceptance before integrator.
6. **Retro** — after each iteration/loop-back, fold new `loop/learnings.jsonl`
   entries into `loop/learnings.md`, promote any lesson seen 2+ times to a
   standing rule, and surface top learnings in the stage report (see
   [learning-loop.md](learning-loop.md)).
7. **Repeat** until terminal conditions in stages.md are met or `maxIterations` reached.
8. **Report** — summarize artifacts, PR URL, test results, remaining warnings, and learnings recorded.

## Subagent roster

| Stage | Subagent | When |
|-------|----------|------|
| Loop owner | orchestrator | Coordinate all stages |
| 1 | product-spec | Turn intent into requirements |
| 2 | architect | System design and contracts |
| 3 | implementer | Write application code |
| 4 | verifier | Tests and correctness |
| 5 | reviewer | Code quality review |
| 6 | security-reviewer | Security audit |
| 7 | qa-acceptance | Acceptance criteria validation |
| 8 | integrator | CI green, PR merge-ready |
| 9 | devops | Pipelines and infrastructure |
| 10 | release | Versioning and deployment |
| 11 | monitor | Production observability |
| 12 | docs | Documentation |
| 13 | debugger | Root-cause unclear failures |

Specialists (delegated from implementer): frontend, backend, data, mobile, design-ux, performance, compliance, cost.

## Prompt template for each delegation

```
Goal: {goal}
Prior handoff: {json}
Your stage: {stage}

Before starting: read loop/learnings.md (your section + `all`) and this handoff's
`learnings` array, and apply every finding aimed at you (learning-loop.md).

Complete your stage per your agent definition. Before finishing:
1. Write handoff to loop/handoffs/{stage}-{iso-timestamp}.json
2. Follow the handoff contract in skills/closed-loop/handoffs.md
3. Set nextStage and loopBackTo appropriately
4. Append your new learnings to loop/learnings.jsonl AND put cross-agent findings
   in the handoff `learnings` array (ping the agents who need them)
```

## Running the loop

| Platform | How to start |
|----------|--------------|
| **Cursor** | "Use the closed-loop skill to build …" or invoke `@orchestrator` |
| **Claude Code** | `/closed-loop` or "Use the orchestrator agent to build …" |
| **Programmatic** | `yarn loop "Build a todo app"` (Cursor SDK orchestrator) |

## Iteration limits

Default max 10 revision loops. If exceeded, pause and ask the user whether to continue or adjust scope.
