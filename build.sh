#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ENTRY="$ROOT/src/index.ts"
OUTDIR="$ROOT/dist"
OUTFILE="$OUTDIR/app"
BUILD_TARGET="${BUILD_TARGET:-bun-linux-x64}"

if [ ! -f "$ENTRY" ]; then
  echo "❌ Entry tidak ada: $ENTRY"
  exit 1
fi

mkdir -p "$OUTDIR"

echo "[app] compile ${BUILD_TARGET} → ${OUTFILE}"
bun build "$ENTRY" \
  --compile \
  --target="$BUILD_TARGET" \
  --outfile "$OUTFILE" \
  --minify \
  --no-compile-autoload-dotenv

chmod +x "$OUTFILE"
echo "[app] ✅ binary siap (./dist/app — tanpa bun di server)"
