#!/usr/bin/env bash
set -euo pipefail
if [[ -f /world/env/.env ]] && grep -q 'BENCH_TOKEN=ready' /world/env/.env; then
  exit 0
fi
exit 1
