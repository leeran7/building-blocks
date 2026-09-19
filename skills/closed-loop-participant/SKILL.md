---
name: closed-loop-participant
description: >-
  Lightweight closed-loop skill for non-orchestrator agents. Covers handoff
  contract, stage routing, and learning-loop protocol. Orchestrator-only
  content (dispatch, iteration, pack setup) is excluded.
---

# Closed-Loop Participant

You are a stage in the closed-loop pipeline. Your job: do your stage's work,
write a handoff, and record learnings for other agents.

## Before starting

1. Read the prior handoff (including its `learnings` array — those are
   cross-agent pings aimed at you). Apply or explicitly reject each one.
2. Read `loop/learnings.md` for open questions that may affect your work.

## References (in this skill directory)

- **handoffs.md** — handoff contract, required fields, status values, findings
  and learnings format.
- **stages.md** — stage graph, routing table, terminal conditions.
- **learning-loop.md** — how the promote-then-prune pipeline works and what
  to put in your handoff `learnings` array.

## Before finishing

1. Write `loop/handoffs/<agent>-<ISO-timestamp>.json` per `handoffs.md`.
2. Put new learnings in the handoff `learnings` array.
3. Cross-check: "What did I discover that a *different* agent needs to know?"
