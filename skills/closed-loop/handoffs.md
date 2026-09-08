# Handoff Contract

Every agent in the closed loop writes a handoff file to `loop/handoffs/<agent>-<timestamp>.json` before finishing.

## Required fields

```json
{
  "agent": "implementer",
  "status": "success",
  "summary": "Implemented user auth with JWT and login endpoint.",
  "timestamp": "2026-08-22T12:00:00Z",
  "goal": "Build auth per spec acceptance criteria AC-1 through AC-4",
  "artifacts": ["src/auth/login.ts", "src/auth/jwt.ts"],
  "exitCriteria": {
    "code_compiles": true,
    "tests_exist": true
  },
  "feedback": [],
  "learnings": [],
  "nextStage": "verifier"
}
```

Every handoff carries a `learnings` array: findings this agent is **pinging at
other agents** so they arrive without anyone grepping the ledger. This is how
agents continuously learn from each other. See
[learning-loop.md](learning-loop.md) for the full protocol.

## Status values

| Status | Meaning | Loop action |
|--------|---------|-------------|
| `success` | Exit criteria met | Proceed to `nextStage` |
| `needs_revision` | Fixable issues found | Route to `loopBackTo` (usually implementer) |
| `blocked` | Cannot proceed without input | Pause loop, surface to user |
| `failed` | Unrecoverable error | Pause loop, surface to user |

## Feedback format

```json
{
  "severity": "critical",
  "message": "Login endpoint missing rate limiting",
  "file": "src/auth/login.ts",
  "line": 42,
  "action": "Add rate limit middleware before handler"
}
```

Severity levels:
- **critical** — must fix before merge
- **warning** — should fix, not blocking
- **info** — suggestion only

## Findings format (reviewer / security-reviewer)

Quality-gate agents (`reviewer`, `security-reviewer`) emit a `findings` array
in addition to, or instead of, `feedback`. The orchestrator treats **either**
shape as blocking when `severity` is `critical`, and also treats
`exitCriteria.no_critical_findings` / `no_critical_security_findings === false`
as `needs_revision`.

```json
{
  "severity": "critical",
  "location": "src/auth/login.ts:42",
  "issue": "Login endpoint missing rate limiting",
  "fix": "Add rate limit middleware before handler"
}
```

Do not omit `findings` just because `feedback` is documented above. The loop
reads both.

## Learnings format (optional cross-agent pings)

Only include when you hit something genuinely new and reusable — otherwise omit
the array. Three fields, nothing more:

```json
{
  "forAgents": ["implementer"],
  "insight": "Webhook handler read the raw body twice; the second read was empty.",
  "action": "Buffer the raw body once, pass it to constructEvent; never re-read req.body."
}
```

The orchestrator appends new entries to `loop/learnings.md` Notes. You do not
write the ledger yourself. See [learning-loop.md](learning-loop.md).

## Reading prior handoffs

Before starting, read the latest upstream handoff from `loop/state.json` —
including its `learnings` array (findings aimed at you) — plus the top of
`loop/learnings.md` (Standing rules + Notes tagged for you or `all`). Apply what
fits. See [learning-loop.md](learning-loop.md).
