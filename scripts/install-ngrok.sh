#!/usr/bin/env bash
# Idempotent ngrok install for Cloud Agent builds and local dev.
set -euo pipefail

if command -v ngrok >/dev/null 2>&1; then
  echo "ngrok already installed: $(ngrok version 2>/dev/null || ngrok --version)"
  exit 0
fi

echo "Installing ngrok..."
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc \
  | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" \
  | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y ngrok

echo "ngrok installed: $(ngrok version 2>/dev/null || ngrok --version)"
