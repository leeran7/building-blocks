# Learning Loop — Promote Then Prune

Learnings are a **pipeline**, not a store. Every finding either gets promoted
to its permanent home or gets dropped. Zero steady-state size.

## The pipeline

```
Agent handoff → orchestrator retro → promote to docs → prune the entry
```

Agents record findings in their handoff `learnings` array. The orchestrator
evaluates each one, routes it to the right permanent file, and deletes it.
Nothing accumulates in `loop/learnings.md`.

## Where findings go

| Finding type | Promote to |
|---|---|
| Product-agnostic, found by 2+ agents | `skills/closed-loop/gates.md` |
| Testing / security / architecture pattern | `.claude/rules/<category>.md` |
| Product-specific trust or security | `context/trust.md` |
| Product-specific convention | `context/conventions.md` |
| UX / design pattern | `context/ux*.md` |
| Agent-specific technique | `agents/<agent>.md` |
| Spec / flow pattern | `agents/software-engineer/flows.md` |
| Unresolved question needing a decision | `loop/learnings.md` (open questions only) |
| One-off observation, not recurring | Drop |

## What agents do

### Before working

1. Read `context/README.md` and every file it lists — the promoted learnings
   are already there.
2. Read the prior handoff `learnings` array for direct cross-agent pings.
3. Read `loop/learnings.md` for open questions that may affect your work.

### Before finishing

1. Write `loop/handoffs/<agent>-<ISO-timestamp>.json` per `handoffs.md`.
2. Put new learnings in the handoff `learnings` array (`forAgents`, `insight`,
   `action`; optional `kind`, `topic`, `confidence`).
3. Cross-check: "What did I discover that a *different* agent needs to know?"
   Route it via `forAgents`.

Read-only agents (reviewer, security-reviewer) put learnings only in the
handoff. The orchestrator promotes them.

## Retro step (orchestrator, every iteration)

After each pass or loop-back:

1. Collect all `learnings` arrays from this iteration's handoffs.
2. For each finding, decide: promote or drop.
3. If promoting, append it to the target file with a one-line entry.
4. If it's a question, add it to `loop/learnings.md` under `## Open questions`.
5. Answered questions get removed from `loop/learnings.md`.

The retro is what keeps the docs current. Every iteration, the permanent
files get smarter and the learnings file stays near-empty.

## `loop/learnings.md` structure

```markdown
# Open Questions

Questions that need a human decision before agents can proceed.

- [security-reviewer → software-engineer] Is the free leaderboard a trust boundary?
- [reviewer → software-engineer] One slot or stacking for power-ups?
```

That's it. No topic sections, no standing rules (those live in `gates.md`),
no recently applied (the git log is the record).

## Handoff learnings schema

```json
{"forAgents":["software-engineer"],"insight":"...","action":"...","kind":"lesson","topic":"testing","confidence":"high"}
```

- `kind` — `lesson` | `pattern` | `pitfall` | `metric` | `question`
- `forAgents` — which agents should see this. `["all"]` for global.
- `action` — concrete, imperative. "Be careful with auth" is rejected.
- `confidence` — `low` | `medium` | `high`

## Hard rules

- Learnings must be concrete and imperative. Vague advice is dropped.
- A finding that recurs in 2+ iterations or from 2+ agents gets promoted
  immediately — the system must get stricter, never re-learn a pitfall.
- Never delete the open questions without resolving them.
- Cross-agent pings must be answered. An unanswered ping is a loop defect.
