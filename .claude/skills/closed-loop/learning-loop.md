# Learning Loop — Continuous Cross-Agent Improvement

The closed loop is not just a pipeline; it is a **learning system**. Every agent
pings findings off the others and records what it learned so the *next* run —
and the next agent in *this* run — is smarter. This is mandatory, not optional.
No stage is "done" until it has both **read** prior learnings and **recorded** new
ones.

## The shared learning ledger

Two files under `loop/`, both persistent across runs (never deleted between builds):

| File | Format | Purpose |
|------|--------|---------|
| `loop/learnings.md` | Human-readable | Curated, deduplicated lessons grouped by topic. The canonical memory. |
| `loop/learnings.jsonl` | One JSON object per line | Append-only event log every agent writes to. Source data for the ledger. |

If either file is missing, the first agent to run creates it (empty `learnings.md`
with the section headers below; empty `learnings.jsonl`).

### `learnings.jsonl` entry schema

Append exactly one line per learning:

```json
{"ts":"2026-08-24T12:00:00Z","agent":"verifier","iteration":3,"stage":"verify","kind":"lesson","topic":"testing","forAgents":["implementer","architect"],"insight":"Stripe webhook handler was untestable because it read the raw request body twice; the first read consumed the stream.","evidence":"src/api/webhook.ts:34","action":"Buffer the raw body once and pass it to constructEvent; never re-read req.body.","confidence":"high","status":"open"}
```

Fields:
- `kind` — one of `lesson` (something to do differently next time), `pattern` (reusable good approach), `pitfall` (recurring failure mode), `metric` (a measured fact, e.g. p95 latency), `question` (an unresolved cross-agent question).
- `forAgents` — which agents should apply this. Use `["all"]` for global lessons.
- `action` — the concrete, imperative change to make. No vague advice.
- `confidence` — `low` | `medium` | `high` (raised when the lesson recurs).
- `status` — `open` (not yet folded into `learnings.md`) | `applied` | `curated`.

## The four-step protocol (every agent, every run)

### 1. READ — before doing any work
- Open `loop/learnings.md` and read the sections tagged for your agent and `all`.
- Grep `loop/learnings.jsonl` for `"forAgents"` containing your agent name or `"all"` with `"status":"open"`.
- Read the latest upstream handoff (as before). **Also** read that handoff's
  `learnings` array (see handoff contract) — these are findings the previous
  agent is pinging directly at you.

### 2. APPLY — while working
- Act on every `high`-confidence lesson addressed to you. If you deliberately do
  NOT apply one, record why (a new entry with `kind:"lesson"` explaining the
  exception) — silent non-application is not allowed.

### 3. CROSS-CHECK (ping) — before finishing
- Ask: "What did I discover that a *different* agent needs to know?" Route it to
  them explicitly via `forAgents`. Examples:
  - verifier → implementer: "this class of bug keeps recurring, add a guard."
  - security-reviewer → architect: "this contract shape invites injection."
  - qa-acceptance → product-spec: "AC-14 is ambiguous, tighten the Given/When."
  - monitor → implementer + architect: "prod p95 regressed on this endpoint."
- Put the same findings in your handoff's `learnings` array so the immediate next
  agent sees them without grepping.

### 4. RECORD — at handoff time
- Append your new learnings to `loop/learnings.jsonl` (one line each).
- If a learning already exists (same `topic` + `action`), do NOT duplicate —
  bump its `confidence` and, if it recurred, mark it a `pitfall`.

**Read-only agents** (reviewer, security-reviewer, monitor, compliance, cost —
those without Write/Edit) cannot append to the ledger themselves. They RECORD by
putting every learning in their handoff `learnings` array; the orchestrator's retro
appends those to `loop/learnings.jsonl` on their behalf. Their obligation to READ
and to PING is unchanged.

## Retro step (orchestrator, end of every iteration)

After each full pass (or each loop-back), the orchestrator runs a lightweight
**retro** before advancing:

1. Collect all `learnings.jsonl` entries added this iteration (`"status":"open"`).
2. Deduplicate and fold them into `loop/learnings.md` under the right section,
   setting their jsonl `status` to `curated`.
3. Promote any lesson that has now appeared in **2+ iterations** to a **rule** in
   the relevant agent's "Standing rules from past runs" section of
   `loop/learnings.md` — this is how repeated pain becomes a permanent guardrail.
4. Surface the top new learnings in the one-line stage report to the user.

The retro is what makes learning *consistent*: it happens every iteration, not
just at the end.

## `learnings.md` structure

```markdown
# Learnings Ledger

_Last curated: <ISO timestamp> by orchestrator retro (iteration N)._

## Standing rules (always apply)
- [all] ...
- [implementer] ...

## By topic
### Testing
### Security
### Architecture & contracts
### Performance
### Spec quality
### Build / CI

## Open questions (unresolved, need a decision)
- [qa-acceptance → product-spec] ...

## Recently applied (last 20)
```

## Feedback = a ping that must be answered

When an agent addresses a `forAgents` learning at you, the receiving agent MUST,
in its own handoff, either:
- reference the learning id/insight and state how it was applied, or
- record an explicit exception entry saying why it was not.

An unanswered cross-agent ping is a loop defect — the orchestrator flags it in the
retro and routes it back.

## Hard rules

- No stage completes without a READ and a RECORD step. If you learned nothing new,
  append one `metric` entry (something you measured) — you always record at least one line.
- Never delete `learnings.md` or `learnings.jsonl` between runs; they are the memory.
- Actions must be concrete and imperative. "Be careful with auth" is rejected;
  "verify the Firebase token before any DB query in every /api route" is accepted.
- Lessons that recur across runs become standing rules — the system must get
  stricter over time, never re-learn the same pitfall twice.
