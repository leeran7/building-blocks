# Review

**When:** a diff exists and must pass quality gates.

Dispatch `@reviewer` and `@security-reviewer` in **one** message. Both must `status: success` with no critical findings.

| Change | Who |
|--------|-----|
| Substantial | both + domain specialist |
| Minor | both |
| Trivial (no code) | optional |
| Docs with scripts | both |

Read `agents/reviewer.md` / `agents/security-reviewer.md` only if you **are** that role. Persist their `learnings` arrays into `loop/learnings.jsonl` (they are read-only).
