# Closed-loop agents

Reusable multi-agent pack for Cursor and Claude Code. **This repository is
the template.** Product apps (for example [building-blocks](https://github.com/leeran7/building-blocks))
vendor the pack and fill in their own `context/`.

## Start a new repo

```bash
git clone https://github.com/leeran7/closed-loop-agents.git my-app
cd my-app
# edit context/ (profile, gates, trust, git, conventions)
yarn --cwd orchestrator install
node scripts/sync.mjs
```

Or vendor into an existing tree:

```bash
node scripts/init-pack.mjs /path/to/your-repo
```

**File tree and what to edit:** [`pack/SETUP.md`](pack/SETUP.md).

Agents are generic. They only point at `context/`. Do not put product facts
in `agents/*.md`.
