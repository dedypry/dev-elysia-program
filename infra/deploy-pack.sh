#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "❌ bun tidak ditemukan di PATH"
  exit 1
fi

echo ">>> bun install"
bun install

echo ">>> build → dist/ (linux x64 binary)"
BUILD_TARGET=bun-linux-x64 bash "$ROOT/build.sh"

if [ ! -x "$ROOT/dist/app" ]; then
  echo "❌ dist/app tidak ada setelah build"
  exit 1
fi

echo "✅ dist/ siap ($(du -sh "$ROOT/dist" | cut -f1))"
ls -la "$ROOT/dist"
