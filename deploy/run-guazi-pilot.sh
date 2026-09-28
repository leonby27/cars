#!/usr/bin/env bash
# Isolated server collector. No database, website deployment or timer installation.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p runtime
# One server run owns the persistent browser profile at a time.
exec 9>runtime/guazi-server.lock
flock -n 9 || { printf '%s\n' 'Guazi server collector is already running.' >&2; exit 1; }
exec nice -n 10 xvfb-run -a node scripts/guazi-pilot.mjs \
  --profile runtime/guazi-profile --transport session-http --verify-checkbox \
  --workers 4 --delay 800 --request-interval 400 --photo-workers 8 "$@"
