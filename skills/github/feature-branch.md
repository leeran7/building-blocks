# Parallel PRs into one feature branch

Use this when several PRs were built in parallel (threads, subagents, sessions)
and should reach trunk together as **one PR**. It differs from a stack: the PRs
are siblings, not layers, and the integrator resolves their overlaps once.

## Recipe

1. **Cut the branch.** Create `feat/<topic>` from the current trunk and push it
   (`git push origin origin/<trunk>:refs/heads/feat/<topic>`).
2. **Refresh every PR head.** Fetch each branch just before merging. Owner
   threads may still be pushing fixes.
3. **Merge locally in dependency order** on an integration branch cut from the
   feature branch: foundations first, then consumers. A stacked PR goes right
   after its base. Use `git merge --no-ff`, never a rebase. Other people's
   branches keep their history.
4. **Resolve each conflict by keeping both sides** when the changes are
   additive (a new prop next to another new prop, or two new fields). Ask the
   user only when both sides changed the same logic and either choice loses
   behavior. Look past the conflict markers: a refactor on one side can
   silently drop what the other side added (a column in a shared select, a
   field in a shared fixture).
5. **Typecheck after the last merge, then run lint and the full test suite.**
   A branch's tests were written against the old shared types, so a required
   field that another branch added only shows up in typecheck.
6. **Regenerate generated outputs only when their inputs changed.** Diff each
   branch against trunk over the generator's input paths. If only one branch
   touched them and it already committed the regenerated output, leave it
   alone.
7. **Retarget, then push.** Point every PR's base at `feat/<topic>` first,
   then push the combined merge to `feat/<topic>`. GitHub sees each PR's head
   in its base and marks it **merged**, with the pusher's account shown as the
   merger. Tell the other threads that this merge went into the feature
   branch, not trunk, so nobody mistakes it for a trunk merge.
8. **Open one PR** from `feat/<topic>` into trunk. The body lists each PR it
   carries and a one-line summary of each, how each conflict was resolved, the
   new migrations, and every deploy prerequisite (secrets, flags) a human must
   handle. Drive it green and merge only on the user's go.
9. **Follow-ups** go as new PRs into `feat/<topic>` until it merges. After
   that, they target trunk.

## Checking whether a fix is in

A fix can arrive under a different commit (squashed, cherry-picked, or
re-applied by a merge). `git merge-base --is-ancestor <sha> <branch>` can say
no even when the change is present. Diff the fix's files against the branch
(`git diff <sha> <branch> -- <files>`) and confirm that the only differences
come from other PRs.

## Don't

- Rebase or force-push another thread's branch to make merging easier
- Merge the trunk PR without the user's explicit go
- Close the original PRs by hand. Retarget and push, so they read as merged
  where they actually landed.
