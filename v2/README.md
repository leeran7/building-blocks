# Tower v2 — MetaGPT Build

Tower v2 is built autonomously by [MetaGPT](https://github.com/geekan/MetaGPT) (Apache 2.0, free).

## New in v2

| Feature | Description |
|---------|-------------|
| Season Archives | Past seasons at `/seasons` and `/seasons/[id]` with final leaderboard snapshots |
| Owner Dashboard | `/dashboard?token=<token>` — altitude history, burial risk, competitor pricing |
| Referral Program | `/ref/[slug]` tracking + 5% altitude bonus for referrers |
| Burial Alerts | Email via Resend when block drops below 2× ground clearance |
| Embed Widget | `/embed/[slug]` SVG badge (rank, altitude, status) for READMEs |
| Categories | Tech / Design / Business / Creative / Other — filterable on tower page |

## Run the build

```bash
# 1. Get your key from console.anthropic.com → API Keys
export ANTHROPIC_API_KEY=sk-ant-api03-...

# 2. Run MetaGPT (free, Apache 2.0)
python3 v2/run.py
```

MetaGPT agents: **ProductManager → Architect → Engineer → QAEngineer**

Output lands in `v2/workspace/tower_v2/`.

## MetaGPT config

`~/.metagpt/config2.yaml` — pre-configured for Claude (reads `ANTHROPIC_API_KEY` from env).
