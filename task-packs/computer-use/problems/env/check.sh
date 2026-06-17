#!/usr/bin/env bash
set -euo pipefail
if [[ -f /world/env/.env ]] && grep -q 'SERVICE_TOKEN=bench-ready' /world/env/.env; then
  exit 0
fi
exit 1
