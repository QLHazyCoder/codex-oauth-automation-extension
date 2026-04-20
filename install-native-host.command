#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

EXTENSION_ID="${1:-}"
TARGET="${2:-chrome}"

if [[ -z "$EXTENSION_ID" ]]; then
  read -r -p "Chrome 扩展 ID: " EXTENSION_ID
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/install_native_messaging_host.py --extension-id "$EXTENSION_ID" --target "$TARGET"
fi

echo "Python 3 not found. Please install Python 3.10+ and try again."
read -r -p "Press Enter to exit..."
