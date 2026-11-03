#!/usr/bin/env bash
set -euo pipefail

UNIT_NAME=elisyajs-app.service
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/$UNIT_NAME"
DEST="/etc/systemd/system/$UNIT_NAME"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo"
  exit 1
fi

cp "$SRC" "$DEST"
chmod 644 "$DEST"
systemctl daemon-reload
systemctl enable "$UNIT_NAME"
echo "✅ $UNIT_NAME terpasang"
echo "   sudo systemctl start elisyajs-app"
echo "   sudo journalctl -u elisyajs-app -f"
