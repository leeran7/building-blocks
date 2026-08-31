# Sync the pack

**When:** you edited `agents/*.md` or `skills/closed-loop/`.

```bash
node scripts/sync.mjs
```

Hygiene runs first. Do not edit `.cursor/agents/` or `.claude/agents/` by hand. Install/vendor: `pack/SETUP.md`.
