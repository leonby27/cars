#!/usr/bin/env bash
# Compatibility entry point: install the complete shared protection policy.
set -euo pipefail
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/install-car-bot-protection.sh" "$@"
