#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Start backend API
cd "$ROOT/backend"
node --experimental-sqlite src/server.js &
BACKEND_PID=$!

# Start frontend (this will be the exposed port)
cd "$ROOT/frontend"
npm run dev

trap "kill $BACKEND_PID" EXIT
