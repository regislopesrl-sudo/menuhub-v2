#!/usr/bin/env bash
set -euo pipefail

LOCAL_DIR="$HOME/sistema-delivery-futuro"
REMOTE_USER="regisadmin"
REMOTE_HOST="46.224.226.72"
REMOTE_PROJECT="/home/regis/sistema-delivery-futuro"
TMP_TAR="/tmp/local-sistema.tar.gz"

echo "1. Criando tar do projeto local"
cd "$LOCAL_DIR"
tar czf "$TMP_TAR" .

echo "2. Enviando para o servidor"
scp "$TMP_TAR" "${REMOTE_USER}@${REMOTE_HOST}:/tmp/local-sistema.tar.gz"

echo "3. Sincronizando e deploy no servidor"
ssh "${REMOTE_USER}@${REMOTE_HOST}" bash -lc "\
  cd $REMOTE_PROJECT && \
  ./scripts/sync-and-deploy.sh && \
  sudo nginx -s reload && \
  curl -i https://api.menuhub.net.br/health && \
  curl -i https://api.menuhub.net.br/api/health\
"

echo "4. Limpando arquivo temporário"
rm -f "$TMP_TAR"

echo "Deploy para menuhub concluído."
