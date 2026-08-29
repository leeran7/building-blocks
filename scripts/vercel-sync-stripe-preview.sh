#!/usr/bin/env bash
# Push Stripe test keys from app/.env to Vercel Preview (and Development).
# Does not touch Production.
#
# Usage:
#   export VERCEL_TOKEN="..."   # https://vercel.com/account/tokens
#   bash scripts/vercel-sync-stripe-preview.sh
#
# Requires the Vercel project linked under app/ (run `cd app && vercel link` once).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/app/.env"
APP_DIR="$ROOT/app"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy app/.env.example and fill in Stripe keys."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

missing=()
for var in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if ((${#missing[@]} > 0)); then
  echo "Missing in $ENV_FILE: ${missing[*]}"
  exit 1
fi

if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "VERCEL_TOKEN is not set."
  echo "Create one at https://vercel.com/account/tokens and re-run."
  exit 1
fi

if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing Vercel CLI..."
  npm install -g vercel@latest
fi

cd "$APP_DIR"

if [[ ! -f .vercel/project.json ]]; then
  echo "Link this repo to your Vercel project first:"
  echo "  cd app && vercel link"
  exit 1
fi

sync_var() {
  local name="$1"
  local value="$2"
  local target="$3"

  echo "→ $name ($target)"
  # vercel env add reads the value from stdin; --force overwrites existing.
  printf '%s' "$value" | vercel env add "$name" "$target" --force --token "$VERCEL_TOKEN"
}

for target in preview development; do
  echo ""
  echo "Syncing Stripe env to Vercel: $target"
  sync_var STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY" "$target"
  sync_var STRIPE_WEBHOOK_SECRET "$STRIPE_WEBHOOK_SECRET" "$target"
done

echo ""
echo "Done. Stripe test keys are on Preview + Development."
echo "Redeploy an open PR preview (or push a commit) to pick up the new values."
echo ""
echo "Note: STRIPE_WEBHOOK_SECRET only works if Stripe sends webhooks to that"
echo "deployment URL. Local/ngrok and Vercel preview URLs need separate webhook"
echo "endpoints in Stripe Dashboard (or test payments only on the URL you registered)."
