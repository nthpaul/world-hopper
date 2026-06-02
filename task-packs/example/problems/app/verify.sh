#!/usr/bin/env bash
set -euo pipefail
PORT=$(grep -E '^port:' /world/app/config.yaml | awk '{print $2}')
if [[ "$PORT" == "8080" ]]; then
  exit 0
fi
exit 1
