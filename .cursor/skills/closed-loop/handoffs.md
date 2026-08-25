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

## Learnings format (cross-agent pings)

```json
{
  "topic": "testing",
  "forAgents": ["implementer", "architect"],
  "kind": "lesson",
  "insight": "Webhook handler read the raw body twice; the second read was empty.",
  "action": "Buffer the raw body once, pass it to constructEvent; never re-read req.body.",
  "confidence": "high"
}
```

Each learning here MUST also be appended (one line) to `loop/learnings.jsonl`.
See [learning-loop.md](learning-loop.md).

## Reading prior handoffs

Before starting work, read the latest handoff from the upstream agent listed in
`loop/state.json` — **including its `learnings` array**, which are findings the
previous agent aimed directly at you. Also read `loop/learnings.md` (your section
+ `all`). Answer every ping addressed to you: apply it, or record an explicit
exception. See [learning-loop.md](learning-loop.md).
