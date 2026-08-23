"""
Tower v2 — MetaGPT autonomous build runner.

Usage:
    export ANTHROPIC_API_KEY=sk-ant-...
    python3 v2/run.py
"""

import asyncio
import sys
from metagpt.software_company import generate_repo
from metagpt.const import METAGPT_ROOT

TOWER_V2_REQUIREMENT = """
Build Tower v2 — an inflation-based link leaderboard web application.

## What Tower is
Tower is a public leaderboard where links (blocks) compete for rank by altitude.
Altitude is permanent — you buy metres with USD. But the ground rises with
cumulative page views, eventually burying under-funded blocks.
The inflation engine: growth = min(exp(ln(2)/DOUBLE_EVERY_K * V), 8)
where V = cumulative qualified views in thousands.

## Tower v1 already has (do NOT re-implement):
- Next.js 14 App Router, Prisma + PostgreSQL, Upstash Redis, Stripe payments
- Engine: computeGrowth, computeRate, computeGround (ground = G0 * growth)
- View pipeline: bot filter → IP cap → session dedup → global ceiling → credit
- Tower page with FLIP animation (rank changes with 30ms stagger)
- Record pages /b/[slug] with stats + top-up form
- OG image generation, Stripe webhook idempotency

## Tower v2 NEW FEATURES to spec and build:

### 1. Season Archives
- Past seasons viewable at /seasons and /seasons/[id]
- Each season shows final leaderboard snapshot, total views, top block
- Season summary cards with winner badge
- Prisma: snapshot table capturing final ranks when season ends

### 2. Block Owner Dashboard
- Owners access /dashboard?token=<owner_token> (token emailed at signup)
- Shows: altitude history chart (daily snapshots), views_served over time,
  click-through rate, burial risk score (days until buried at current rate),
  competitor analysis (what it costs to overtake rank above)
- Read-only — no editing, no auth system needed beyond the token

### 3. Referral / Affiliate Program
- Each block gets a /ref/[slug] redirect that counts referral clicks
- Referrers earn 5% bonus altitude on any payment made via their ref link
- Stored in DB: referral_clicks table, referral_bonus_c on blocks
- No cash payouts — altitude only

### 4. Burial Alert Emails
- When a block drops below 2x ground clearance, queue an alert email
- Use Resend (resend.com) for transactional email — free tier 3k/mo
- Email: "Your block [name] is at risk of burial in ~X days. Top up now."
- Send at most once per 24h per block
- Track last_alerted_at on blocks table

### 5. Public Embed Widget
- GET /embed/[slug] returns a 400×80 badge SVG showing:
  rank, block name, altitude, buried/active status
- Cache-Control: s-maxage=60
- Useful for README badges, external sites

### 6. Block Categories / Tags
- Blocks can have one category: Tech, Design, Business, Creative, Other
- Category filter on the tower page (client-side filter, no new API)
- Category badge shown on BlockRow and record page
- Migration: add category column to blocks

## Tech constraints (same as v1):
- Next.js 14 App Router, TypeScript strict, pnpm, Tailwind CSS
- Prisma + PostgreSQL, Upstash Redis (edge-compatible)
- Vitest for unit tests — write tests for all new engine/DB logic
- No new auth systems — use simple tokens and admin middleware pattern from v1
- Keep existing engine functions unchanged

## Deliverables:
- Full Next.js application with all 6 features implemented
- Prisma migrations for new tables/columns
- Vitest unit tests for new logic
- Updated README with v2 feature list
"""

async def main():
    print("🏗️  Starting MetaGPT — Tower v2")
    print("=" * 60)
    print("Agents: ProductManager → Architect → Engineer → QA")
    print("Output directory: v2/workspace/")
    print("=" * 60)

    repo = await generate_repo(
        idea=TOWER_V2_REQUIREMENT,
        investment=10.0,
        n_round=10,
        code_review=True,
        run_tests=True,
        implement=True,
        project_name="tower_v2",
    )

    print("\n✅ MetaGPT complete.")
    print(f"Generated code: {repo.workdir}")

if __name__ == "__main__":
    asyncio.run(main())
