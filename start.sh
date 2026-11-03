#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$ROOT/dist/app"

if [ ! -x "$APP" ]; then
  echo "❌ Belum build. Jalankan: bash build.sh"
  exit 1
fi

exec "$APP"
