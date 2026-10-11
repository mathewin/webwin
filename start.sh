#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend API
cd "$ROOT/backend"
node src/server.js &
BACKEND_PID=$!

# Start frontend (exposed preview port)
cd "$ROOT/frontend"
npm run dev

trap "kill $BACKEND_PID" EXIT
