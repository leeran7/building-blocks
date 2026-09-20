Boy Scout Rule: leave the code you touch cleaner than you found it. When a
change puts you inside or next to duplicated logic or markup, deduplicate it
in the same commit rather than adding a third copy — extract a shared
helper/component and point every call site at it. Scope this to what the
change already touches; do not go refactor unrelated files under this
banner.

When mobile and web (or any other duplicated-by-necessity surfaces) each
hand-roll the same conditional/snippet, prefer one shared implementation
reused via the repo's existing cross-surface pattern (`@app/*` for mobile
importing shared `src/`) over parallel copies that can silently drift.

A cleanup under this rule still owes the same proof as any other change: run
the full gate suite (lint, typecheck, tests) after extracting, confirm the
test count and results are unchanged, and check both trees when a shared
surface is involved.
