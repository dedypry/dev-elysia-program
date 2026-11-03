#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SSH_IDENTITY="${SSH_IDENTITY:-$HOME/.ssh/fe_prod}"
SSH_USER="${SSH_USER:-hanun_shahreza}"
SSH_HOST="${SSH_HOST:-34.101.148.229}"
REMOTE_DIR="${REMOTE_DIR:-.vim}"
SSH_PORT="${SSH_PORT:-22}"
DIST_DIR="$ROOT/dist"

if [ ! -x "$DIST_DIR/app" ]; then
  echo ">>> dist/app belum ada, jalankan build..."
  BUILD_TARGET=bun-linux-x64 bash "$ROOT/build.sh"
fi

if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
  echo "❌ dist/ kosong"
  exit 1
fi

if [ ! -f "$SSH_IDENTITY" ]; then
  echo "❌ SSH key tidak ada: $SSH_IDENTITY"
  exit 1
fi

chmod 600 "$SSH_IDENTITY" 2>/dev/null || true

mkdir -p ~/.ssh
if [ "$SSH_PORT" != "22" ]; then
  ssh-keyscan -p "$SSH_PORT" "$SSH_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true
else
  ssh-keyscan "$SSH_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true
fi

SSH_CMD=(ssh -i "$SSH_IDENTITY" -p "$SSH_PORT" -o IdentitiesOnly=yes)
RSYNC_SSH="ssh -i ${SSH_IDENTITY} -p ${SSH_PORT} -o IdentitiesOnly=yes"

DEST="${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

echo ">>> rsync dist/* → ${DEST}"
ls -la "$DIST_DIR"

RSYNC_OK=0
for i in 1 2 3 4 5 6; do
  if rsync -rp --delete-after \
    --exclude='.env' \
    --exclude='logs/' \
    -e "$RSYNC_SSH" \
    "$DIST_DIR/" "$DEST"; then
    echo "rsync ok (attempt $i)"
    RSYNC_OK=1
    break
  fi
  echo "Retrying rsync... ($i)"
  sleep 10
done

if [ "$RSYNC_OK" -ne 1 ]; then
  echo "❌ rsync failed after 6 attempts"
  exit 1
fi

echo ">>> remote: .env + pg_dump di PATH; jalankan: cd ${REMOTE_DIR} && ./app"
