#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.hml.yml}"
PROJECT_DIR="${PROJECT_DIR:-/home/deploy/menuhub-v2}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://localhost:3202/v2/health}"

log() {
  printf '[deploy-hml] %s\n' "$*"
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
require_cmd curl

log "Entrando no diretorio do projeto: ${PROJECT_DIR}"
cd "${PROJECT_DIR}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  printf 'Erro: compose file nao encontrado: %s\n' "${COMPOSE_FILE}" >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "${current_branch}" != "main" ]]; then
  printf 'Erro: deploy HML so pode rodar na branch main. Branch atual: %s\n' "${current_branch}" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  printf 'Erro: working tree suja. Faça commit/stash antes do deploy.\n' >&2
  git status --short
  exit 1
fi

before_commit="$(git rev-parse --short HEAD)"
log "Commit atual (antes do update): ${before_commit}"

log "Atualizando refs remotas"
git fetch origin

log "Atualizando main local"
git pull origin main

after_commit="$(git rev-parse --short HEAD)"
log "Commit atual (apos pull): ${after_commit}"

printf '\nConfirme que o backup do banco HML foi feito digitando: BACKUP_OK\n'
read -r backup_confirmation
if [[ "${backup_confirmation}" != "BACKUP_OK" ]]; then
  printf 'Erro: confirmacao invalida. Deploy interrompido.\n' >&2
  exit 1
fi

log "Validando docker compose"
docker compose -f "${COMPOSE_FILE}" config >/dev/null

log "Buildando imagens da API e Web"
docker compose -f "${COMPOSE_FILE}" build api-v2 web-v2

log "Prisma validate"
docker compose -f "${COMPOSE_FILE}" run --rm api-v2 \
  npx prisma validate --schema apps/api-v2/prisma/schema.prisma

log "Prisma migrate status"
docker compose -f "${COMPOSE_FILE}" run --rm api-v2 \
  npx prisma migrate status --schema apps/api-v2/prisma/schema.prisma

log "Prisma migrate deploy"
docker compose -f "${COMPOSE_FILE}" run --rm api-v2 \
  npx prisma migrate deploy --schema apps/api-v2/prisma/schema.prisma

log "Subindo/recriando servicos api-v2 e web-v2"
docker compose -f "${COMPOSE_FILE}" up -d --no-deps api-v2 web-v2

log "Status dos servicos"
docker compose -f "${COMPOSE_FILE}" ps

log "Logs recentes da API"
docker compose -f "${COMPOSE_FILE}" logs api-v2 --tail=200

log "Logs recentes da WEB"
docker compose -f "${COMPOSE_FILE}" logs web-v2 --tail=200

log "Healthcheck HTTP: ${HEALTHCHECK_URL}"
curl -fsS "${HEALTHCHECK_URL}"

cat <<'EOF'

Deploy HML finalizado com sucesso.

Smoke tests manuais recomendados:
1. Login tecnico e acesso /developer/companies
2. Fluxo Assinatura / Modulos / Billing
3. /admin e /admin/modules sem erro de hydration
4. Webhook mock com comportamento idempotente
5. Validar logs sem erro Prisma/Nest em 5-10 minutos
EOF
