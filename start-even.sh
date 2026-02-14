#!/usr/bin/env bash

# =========================
# Even Hub Dev Launcher
# =========================

set -e

VITE_HOST="${VITE_HOST:-0.0.0.0}"
SIM_HOST="${SIM_HOST:-127.0.0.1}"
PORT="${PORT:-5173}"
URL="${URL:-http://${SIM_HOST}:${PORT}}"

echo "Starting Even Hub development environment... ${URL}"

# --------------------------------------------------
# Helpers
# --------------------------------------------------

command_exists () {
  command -v "$1" >/dev/null 2>&1
}

# --------------------------------------------------
# Check Node / npm
# --------------------------------------------------

if ! command_exists node; then
  echo "Node.js is not installed."
  exit 1
fi

if ! command_exists npm; then
  echo "npm is not installed."
  exit 1
fi

# --------------------------------------------------
# Ensure local dependencies installed
# --------------------------------------------------

if [ ! -d "node_modules" ]; then
  echo "Installing project dependencies..."
  npm install
fi

# --------------------------------------------------
# Ensure Vite installed locally
# --------------------------------------------------

if [ ! -d "node_modules/vite" ]; then
  echo "Installing vite locally..."
  npm install --save-dev vite
fi

# --------------------------------------------------
# Start Vite server
# --------------------------------------------------

echo "Starting Vite dev server..."

npx vite --host "${VITE_HOST}" --port "${PORT}" &

VITE_PID=$!

trap "kill ${VITE_PID}" EXIT

# --------------------------------------------------
# Wait for server to be reachable
# --------------------------------------------------

echo "Waiting for Vite server..."

until curl --output /dev/null --silent --head --fail "$URL"; do
  sleep 1
done

echo "Vite is ready."

# --------------------------------------------------
# Launch simulator
# --------------------------------------------------

echo "Launching Even Hub Simulator..."
if command_exists evenhub-simulator; then
  evenhub-simulator "${URL}"
else
  npx @evenrealities/evenhub-simulator "${URL}"
fi
