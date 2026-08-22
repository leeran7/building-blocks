# Building Blocks — Closed Loop Agents

Multi-agent system for building apps autonomously. Works in **Cursor** and **Claude Code**.

## Quick start (Claude Code)

```
/closed-loop
```

Or invoke the orchestrator directly:

```
Use the orchestrator agent to run the closed loop: Build a todo app with auth
```

You can also @-mention any agent: `@implementer`, `@reviewer`, `@verifier`, etc.

## Agent locations

| Platform | Agents | Skills |
|----------|--------|--------|
| Claude Code | `.claude/agents/` | `.claude/skills/closed-loop/` (`/closed-loop`) |
| Cursor | `.cursor/agents/` | `.cursor/skills/closed-loop/` |
| Source of truth | `agents/` | `skills/closed-loop/` |

Edit files in `agents/` or `skills/`, then run `yarn sync` to regenerate platform-specific copies.

## Loop runtime

Shared runtime artifacts live in `loop/` (not platform-specific):

- `loop/state.json` — current stage and iteration
- `loop/handoffs/` — JSON handoffs between agents
- `loop/spec.md`, `loop/architecture.md`, etc. — stage outputs

## Full agent roster

**Pipeline:** product-spec → architect → implementer → verifier → reviewer → security-reviewer → qa-acceptance → integrator → release → monitor

**Support:** orchestrator, debugger, devops, docs

**Specialists:** frontend, backend, data, mobile, design-ux, performance, compliance, cost

## Handoff contract

Every agent writes `loop/handoffs/<agent>-<timestamp>.json` before finishing. See `skills/closed-loop/handoffs.md`.

## Programmatic loop (Cursor SDK)

```bash
export CURSOR_API_KEY="cursor_..."
yarn loop "Build a todo app with JWT auth"
```

## Sync after edits

```bash
yarn sync
```
