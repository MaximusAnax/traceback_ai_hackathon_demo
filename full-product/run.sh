#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
exec "${REPO_ROOT}/venv/bin/python3" "${REPO_ROOT}/full-product/main.py" "$@"
