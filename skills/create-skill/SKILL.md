---
name: create-skill
description: >-
  Scaffold a new skill directory with enforced conventions: lowercase naming,
  symlinks for shared files, SKILL.md entry point, and config registration.
---

# Create Skill

Follow these steps exactly when creating a new skill.

## Conventions

- **Name**: lowercase alphanumeric with hyphens (`my-new-skill`).
- **Location**: `skills/<name>/`.
- **Entry point**: every skill directory has a `SKILL.md` with YAML frontmatter
  (`name`, `description`) and the skill's instructions.
- **Shared files must be symlinks.** If two skills reference the same content
  (e.g. `handoffs.md`, `stages.md`), the newer skill symlinks to the original.
  Never copy a file that already exists in another skill directory. Use
  relative symlinks (`../other-skill/file.md`).
- **Sub-files** referenced by SKILL.md live in the same directory or are
  symlinked in from another skill.

## Steps

1. **Create the directory**: `mkdir -p skills/<name>`.

2. **Write `SKILL.md`** with this template:

   ```markdown
   ---
   name: <name>
   description: >-
     One-line description of what this skill does.
   ---

   # <Title>

   Instructions for the agent.
   ```

3. **Symlink shared files** — for every file that already exists in another
   skill and this skill needs:

   ```bash
   cd skills/<name>
   ln -s ../other-skill/file.md file.md
   ```

   Verify the symlink resolves: `ls -la skills/<name>/`.

4. **Register the skill** in `agents/claude.config.json` — add `"<name>"` to
   the `skills` array of every agent that should load it.

5. **Run `yarn sync`** to propagate to platform directories.

6. **Verify** with `yarn hygiene`.

## Don't

- Copy a file that exists in another skill — symlink it.
- Use absolute symlink paths — always relative (`../`).
- Create a skill without YAML frontmatter in SKILL.md.
- Skip `yarn sync` — platform dirs will be stale.
- Add a skill to `claude.config.json` without confirming the directory exists.
