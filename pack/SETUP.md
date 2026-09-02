# Add closed-loop agents to a new repo

This is the file-structure write-up. Follow it once; agents stay generic and
read **your** `context/` after that.

## Two repositories

| Repo | Role |
|------|------|
| [leeran7/closed-loop-agents](https://github.com/leeran7/closed-loop-agents) | **Template / pack.** Clone this, or run `init-pack` from it. `context/` is placeholders. |
| [leeran7/building-blocks](https://github.com/leeran7/building-blocks) | **Product** that vendors the pack. `context/` is filled in. `app/` is The Climb. |

New product:

```bash
git clone https://github.com/leeran7/closed-loop-agents.git my-app
cd my-app
# fill in context/profile.json, gates.json, trust.md, git.md, conventions.md
yarn --cwd orchestrator install
node scripts/sync.mjs
```

Or vendor into an existing tree from a pack clone:

```bash
node scripts/init-pack.mjs /path/to/your-repo
```

Refresh the template from a building-blocks checkout (pack source after a
change here):

```bash
node scripts/export-template.mjs /path/to/closed-loop-agents
```

There are three kinds of files:

| Kind | Who edits | Copied by `init-pack`? |
|------|-----------|------------------------|
| **Pack** | Only when you change the agent system | Yes |
| **Context** | You, in every consuming repo | Template only (never another product’s facts) |
| **Generated** | Nobody — `yarn sync` rebuilds them | Rebuilt in the target |

## Tree after setup

```
your-repo/
│
├── context/                      ← YOU. This repo’s facts. Agents only point here.
│   ├── README.md                 index: what to read, in what order
│   ├── profile.json              name, stack, package managers, paths
│   ├── gates.json                CI commands + how each was proven to fail
│   ├── trust.md                  irreversible writes, money, secrets
│   ├── git.md                    remote, default branch, PR vs trunk
│   └── conventions.md            how to match this codebase
│
├── loop/                         ← YOU (memory) + runtime (gitignored)
│   ├── learnings.md              this repo’s ledger (version this)
│   ├── learnings.jsonl           append-only events (version this)
│   ├── handoffs/                 per-run; gitignored
│   └── state.json                per-run; gitignored
│
├── agents/                       ← PACK. Generic roles. No product facts.
│   ├── claude.config.json
│   ├── orchestrator.md
│   ├── product-spec.md
│   ├── architect.md
│   ├── implementer.md
│   ├── verifier.md
│   ├── reviewer.md
│   ├── security-reviewer.md
│   ├── qa-acceptance.md
│   ├── integrator.md
│   └── …specialists.md
│
├── skills/closed-loop/           ← PACK. Protocol identical in every repo.
│   ├── SKILL.md                  how to run the loop
│   ├── protocol.md               prepended onto every agent at sync
│   ├── gates.md                  kernel quality rules (not your CI list)
│   ├── handoffs.md
│   ├── team.md
│   ├── stages.md
│   ├── learning-loop.md
│   ├── pack.md                   design of the pack
│   └── host.md                   generic CLAUDE.md body
│
├── pack/                         ← PACK. Schemas, templates, this file.
│   ├── SETUP.md                  ← you are here
│   ├── MANIFEST.json
│   ├── profile.schema.json
│   ├── hygiene-rules.json
│   └── templates/
│       ├── context/              empty context/ for a new repo
│       ├── learnings.md
│       └── gitignore.snippet
│
├── scripts/
│   ├── init-pack.mjs             vendor this pack into another repo
│   ├── sync.mjs                  agents/ + skills/ → .cursor/ and .claude/
│   └── hygiene.mjs               fail if a role file leaks product facts
│
├── orchestrator/                 ← PACK. `yarn loop "goal"` (Cursor SDK)
├── handoffs/schema.json          ← PACK. Handoff JSON schema
│
├── .cursor/agents/               ← GENERATED. Do not edit.
├── .cursor/skills/closed-loop/   ← GENERATED.
├── .claude/agents/               ← GENERATED.
└── .claude/skills/closed-loop/   ← GENERATED.
```

Product code (`app/`, libraries, DESIGN.md, etc.) stays wherever the host
repo already puts it. Point `context/profile.json` `paths.design` at the
live design file. **Do not copy tokens into `agents/`.**

## 5-minute install

From a clone of the pack (this repo, or a future `closed-loop-agents` tree):

```bash
node scripts/init-pack.mjs /path/to/your-repo
cd /path/to/your-repo
```

`init-pack` copies the **pack** files, writes `context/` from templates if
missing, writes an empty learnings ledger if missing, appends the gitignore
snippet (ignore `loop/*`, keep the two ledger files), and runs `sync`.

Then fill in **your** context — this is the only required human step:

1. `context/profile.json` — package managers per path, stack, `paths.design`
2. `context/gates.json` — real lint/test/typecheck commands, each with `proveFail`
3. `context/trust.md` — this product’s money paths and irreversible writes
4. `context/git.md` — remotes and branch policy
5. `context/conventions.md` — “match this tree”

```bash
node scripts/sync.mjs
yarn --cwd orchestrator install
yarn --cwd orchestrator test
```

Invoke `@orchestrator` (Cursor), `/closed-loop` (Claude Code), or
`yarn loop "Build …"` with `CURSOR_API_KEY`.

## What agents read (in order)

Every role file starts with: read `context/README.md`, then the files it
lists. Sync also prepends `skills/closed-loop/protocol.md`. Runtime memory
is `loop/learnings.md`. Kernel rules are `skills/closed-loop/gates.md`.

```
context/          →  this product
protocol + gates  →  every product
agents/*.md       →  the job (verifier, frontend, …)
loop/learnings.md →  what this product already burned itself on
```

If `context/` is missing, agents infer from lockfiles and existing code.
They still must not invent a second stack.

## Do not copy from the pack repo

| Leave behind | Why |
|--------------|-----|
| `app/` | Product |
| `context/` from this repo | Another product’s trust/git/stack |
| `loop/learnings.md` body | Lava, Stripe-altitude, this game |
| `CLAUDE.md` as-is | Host overlay; `init-pack` writes `host.md` only if absent |
| `closed-loop.profile.json` | Replaced by `context/profile.json` |

## After install: commands

| Command | What |
|---------|------|
| `node scripts/sync.mjs` | Rebuild platform agents; runs hygiene first |
| `node scripts/hygiene.mjs` | Fail if `agents/*.md` contain product leakage or omit `context/README.md` |
| `yarn loop "…"` | Programmatic closed loop |
| Edit `agents/` or `skills/` | Then `sync` again |

## File map (pack vs context)

See `pack/MANIFEST.json` `kernel` (copied) and `doNotCopy` (never copied).
Schema for `context/profile.json`: `pack/profile.schema.json`.
Design of layers: `skills/closed-loop/pack.md`.
