#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_TAR="/tmp/local-sistema.tar.gz"
TEMP_DIR="/tmp/local-copy"

if [ ! -f "$TEMP_TAR" ]; then
  echo "Arquivo $TEMP_TAR não encontrado. Copie o arquivo tar local para o servidor antes de rodar."
  exit 1
fi

rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
tar xzf "$TEMP_TAR" -C "$TEMP_DIR"

rsync -a --delete "$TEMP_DIR/" "$ROOT_DIR/"

cd "$ROOT_DIR"
./scripts/deploy.sh

rm -rf "$TEMP_DIR" "$TEMP_TAR"
echo "Sincronização e deploy concluídos."
