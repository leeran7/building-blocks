# Learning Loop — lightweight cross-run memory

One short file: `loop/learnings.md`. Two sections — **Standing rules** (durable,
always-apply) and **Notes** (recent one-liners, newest first, auto-capped at 30).
No JSONL, no retro/fold ceremony, no per-stage bookkeeping. The point is a cheap
signal, not an audit trail.

## Every agent

1. **Read** the top of `loop/learnings.md` (Standing rules + any Note tagged for
   you or `all`). It is short by design — read it, don't grep a log.
2. **Record** only if you hit something genuinely new and reusable: add one
   concise entry to your handoff `learnings` array —
   `{ "forAgents": ["implementer"], "insight": "...", "action": "..." }`.
   If you learned nothing worth another agent's time, omit it. Do **not** pad.

That's the whole protocol. Read-only agents (reviewer, security-reviewer) put
learnings in the handoff only; the orchestrator appends them.

## Orchestrator

After each dispatch, append new handoff `learnings` to the Notes section
(deduped, capped). No fold, no promotion algorithm. `runRetro` in
`orchestrator/src/retro.ts` does exactly this — one append, nothing more.

Occasionally (not every iteration): if a Note keeps recurring and is clearly
durable, hand-promote it to **Standing rules** and prune the Notes. Product-
agnostic rules graduate to `skills/closed-loop/gates.md` instead (see pack.md).

## Rules

- Keep it short. A ledger nobody reads is dead weight — prune aggressively.
- Actions are concrete and imperative ("verify the token before any DB query"),
  never vague ("be careful with auth").
- Never delete `loop/learnings.md` between runs; it is the memory.
