#!/usr/bin/env bash
# Vercel Ignored Build Step. Exit 0 = skip deploy; exit 1 = build.
# Skip when this commit does not change the Next app (loop notes, docs,
# learnings ledger, orchestrator). Prevents production redeploys from
# agent markdown.

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1
PREV="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"

if git -C "$ROOT" diff --quiet "$PREV" HEAD -- app/; then
  echo "skip-vercel: no changes under app/; skipping build"
  exit 0
fi

echo "skip-vercel: app/ changed; building"
exit 1
