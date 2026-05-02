#!/usr/bin/env bash
set -euo pipefail

HOST=46.224.226.72
USER=regisadmin
KEY="$HOME/.ssh/menuhub_deploy"

if [ ! -f "$KEY" ]; then
  echo "Chave $KEY não encontrada. Gere com ssh-keygen antes."
  exit 1
fi

echo "Conectando em $USER@$HOST..."
ssh -i "$KEY" -o IdentitiesOnly=yes "$USER@$HOST"
