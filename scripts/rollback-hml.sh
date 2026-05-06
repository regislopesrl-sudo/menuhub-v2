#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.hml.yml}"
PROJECT_DIR="${PROJECT_DIR:-/home/deploy/menuhub-v2}"
TARGET_COMMIT="${TARGET_COMMIT:-}"

log() {
  printf '[rollback-hml] %s\n' "$*"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Erro: comando obrigatorio nao encontrado: %s\n' "$cmd" >&2
    exit 1
  fi
}

require_cmd git
require_cmd docker

if [[ -z "${TARGET_COMMIT}" ]]; then
  printf 'Erro: informe TARGET_COMMIT. Exemplo:\n' >&2
  printf '  TARGET_COMMIT=abc123 ./scripts/rollback-hml.sh\n' >&2
  exit 1
fi

log "Entrando no diretorio do projeto: ${PROJECT_DIR}"
cd "${PROJECT_DIR}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  printf 'Erro: compose file nao encontrado: %s\n' "${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Erro: working tree suja. Faça commit/stash antes do rollback.\n' >&2
  git status --short
  exit 1
fi

current_commit="$(git rev-parse --short HEAD)"
log "Commit atual: ${current_commit}"
log "Commit alvo: ${TARGET_COMMIT}"

printf '\nConfirme rollback da aplicacao digitando: ROLLBACK_OK\n'
read -r rollback_confirmation
if [[ "${rollback_confirmation}" != "ROLLBACK_OK" ]]; then
  printf 'Erro: confirmacao invalida. Rollback interrompido.\n' >&2
  exit 1
fi

log "Atualizando refs remotas"
git fetch origin

log "Checkout do commit alvo"
git checkout "${TARGET_COMMIT}"

log "Validando docker compose"
docker compose -f "${COMPOSE_FILE}" config >/dev/null

log "Buildando imagens api-v2 e web-v2"
docker compose -f "${COMPOSE_FILE}" build api-v2 web-v2

log "Subindo/recriando servicos api-v2 e web-v2"
docker compose -f "${COMPOSE_FILE}" up -d --no-deps api-v2 web-v2

log "Status dos servicos"
docker compose -f "${COMPOSE_FILE}" ps

log "Logs recentes da API"
docker compose -f "${COMPOSE_FILE}" logs api-v2 --tail=200

log "Logs recentes da WEB"
docker compose -f "${COMPOSE_FILE}" logs web-v2 --tail=200

cat <<'EOF'

Rollback da aplicacao concluido.
ATENCAO: rollback de schema de banco NAO foi executado automaticamente.
Se houver incompatibilidade de schema, restaure backup do banco compatível com o commit alvo.
EOF
