#!/usr/bin/env bash
set -euo pipefail
if [[ -x /world/scripts/deploy.sh ]]; then
  /world/scripts/deploy.sh
  exit 0
fi
exit 1
