#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TARGET="${1:-chrome}"

if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/uninstall_native_messaging_host.py --target "$TARGET"
fi

echo "Python 3 not found. Please install Python 3.10+ and try again."
read -r -p "Press Enter to exit..."
