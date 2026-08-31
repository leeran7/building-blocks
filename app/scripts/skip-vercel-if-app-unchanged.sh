#!/usr/bin/env bash
# Vercel Ignored Build Step. Exit 0 = skip deploy; exit 1 = build.
# Skip only when VERCEL_GIT_PREVIOUS_SHA is a distinct reachable commit
# and `app/` is unchanged in that range. Missing/invalid/self SHA → build.
# Never fall back to HEAD^ (merge tips skip ancestor app/ changes).

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [[ ! "$PREV" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  echo "skip-vercel: VERCEL_GIT_PREVIOUS_SHA missing or not a commit SHA; building"
  exit 1
fi

if ! git -C "$ROOT" cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  echo "skip-vercel: previous SHA is not a reachable commit; building"
  exit 1
fi

PREV_FULL="$(git -C "$ROOT" rev-parse "${PREV}^{commit}" 2>/dev/null)" || exit 1
HEAD_FULL="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)" || exit 1

if [[ "$PREV_FULL" == "$HEAD_FULL" ]]; then
  echo "skip-vercel: previous SHA equals HEAD; building"
  exit 1
fi

if ! git -C "$ROOT" merge-base --is-ancestor "$PREV_FULL" HEAD 2>/dev/null; then
  echo "skip-vercel: previous SHA is not an ancestor of HEAD; building"
  exit 1
fi

git -C "$ROOT" diff --quiet "$PREV_FULL" HEAD -- app/
status=$?
if [[ "$status" -eq 0 ]]; then
  echo "skip-vercel: no changes under app/; skipping build"
  exit 0
fi

echo "skip-vercel: app/ changed; building"
exit 1
