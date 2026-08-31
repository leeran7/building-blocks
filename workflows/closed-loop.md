# Closed loop

**When:** running the agent loop on a goal of any size (bug, feature, refactor, or new app).

Scope is the user’s goal. Do not expand it into a full-app rewrite.

Read `skills/closed-loop/SKILL.md`. Dispatch with `subagent_type` equal to the agent name. After verifier: `reviewer` and `security-reviewer` in the same message. Last stage: `curator`.

Do not also load `pack.md` or `archive/`.
