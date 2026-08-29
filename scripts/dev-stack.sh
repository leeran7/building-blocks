#!/usr/bin/env bash
# Start Next.js dev server + ngrok tunnel with a stable reserved domain.
# Used by .cursor/environment.json start script on Cloud Agent boot.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/app"
PORT="${PORT:-3000}"
LOG_DIR="${LOG_DIR:-/tmp/tower-dev}"
DEV_LOG="$LOG_DIR/dev.log"
NGROK_LOG="$LOG_DIR/ngrok.log"
PID_FILE="$LOG_DIR/dev.pid"
PUBLIC_URL_FILE="$LOG_DIR/public-url.txt"

mkdir -p "$LOG_DIR"

if [[ -z "${NGROK_AUTHTOKEN:-}" ]]; then
  echo "NGROK_AUTHTOKEN is not set — skipping ngrok tunnel."
  echo "Set NGROK_AUTHTOKEN and NGROK_DOMAIN in Cloud Agent secrets for a stable public URL."
  TUNNEL_ENABLED=false
else
  TUNNEL_ENABLED=true
  ngrok config add-authtoken "$NGROK_AUTHTOKEN" >/dev/null 2>&1 || true
fi

if [[ "$TUNNEL_ENABLED" == "true" && -z "${NGROK_DOMAIN:-}" ]]; then
  echo "NGROK_DOMAIN is not set — ngrok needs a reserved domain for a stable URL."
  echo "Claim one at https://dashboard.ngrok.com/domains and set NGROK_DOMAIN (e.g. my-app.ngrok-free.app)."
  exit 1
fi

start_dev_server() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Dev server already running (pid $(cat "$PID_FILE"))."
    return 0
  fi

  if curl -sf "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
    echo "Port ${PORT} already serving — reusing existing dev server."
    return 0
  fi

  echo "Starting Next.js dev server (nodemon) on port ${PORT}..."
  (
    cd "$APP_DIR"
    export PORT
    export BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
    if [[ "$TUNNEL_ENABLED" == "true" ]]; then
      export BASE_URL="https://${NGROK_DOMAIN}"
    fi
    corepack enable >/dev/null 2>&1 || true
    exec pnpm run dev:watch
  ) >>"$DEV_LOG" 2>&1 &
  echo $! >"$PID_FILE"

  echo "Waiting for dev server..."
  for _ in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:${PORT}" >/dev/null 2>&1; then
      echo "Dev server ready at http://127.0.0.1:${PORT} (BASE_URL=${BASE_URL:-http://localhost:${PORT}})"
      return 0
    fi
    if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Dev server exited early. Last log lines:"
      tail -20 "$DEV_LOG" || true
      exit 1
    fi
    sleep 1
  done

  echo "Timed out waiting for dev server on port ${PORT}."
  tail -20 "$DEV_LOG" || true
  exit 1
}

start_ngrok_tunnel() {
  if [[ "$TUNNEL_ENABLED" != "true" ]]; then
    return 0
  fi

  if pgrep -f "ngrok http.*--domain=${NGROK_DOMAIN}" >/dev/null 2>&1; then
    echo "ngrok tunnel already running for ${NGROK_DOMAIN}."
  else
    echo "Starting ngrok tunnel → https://${NGROK_DOMAIN}"
    ngrok http "$PORT" --domain="$NGROK_DOMAIN" --log=stdout >>"$NGROK_LOG" 2>&1 &
    echo $! >"$LOG_DIR/ngrok.pid"
    sleep 2
  fi

  PUBLIC_URL="https://${NGROK_DOMAIN}"
  echo "$PUBLIC_URL" >"$PUBLIC_URL_FILE"
  echo ""
  echo "════════════════════════════════════════════════════════"
  echo " Public URL:  $PUBLIC_URL"
  echo " Stripe hook: ${PUBLIC_URL}/api/webhook/stripe"
  echo " Logs:        $LOG_DIR/"
  echo "════════════════════════════════════════════════════════"
}

start_dev_server
start_ngrok_tunnel

# Keep start script alive so ngrok/dev processes stay attached to the session.
if [[ "$TUNNEL_ENABLED" == "true" && -f "$LOG_DIR/ngrok.pid" ]]; then
  wait "$(cat "$LOG_DIR/ngrok.pid")" 2>/dev/null || tail -f "$NGROK_LOG" "$DEV_LOG"
else
  wait "$(cat "$PID_FILE")" 2>/dev/null || tail -f "$DEV_LOG"
fi
