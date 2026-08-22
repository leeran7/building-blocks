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
  "nextStage": "verifier"
}
```

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

## Reading prior handoffs

Before starting work, read the latest handoff from the upstream agent listed in `loop/state.json`.
