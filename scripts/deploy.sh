#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "1. Atualizando dependencias e compilando"
npm install
npm run build

echo
echo "2. Subindo containers essenciais"
docker compose up -d postgres redis backend

echo
echo "3. Subindo stack de monitoramento (Prometheus/Grafana)"
docker compose -f docker-compose.monitoring.yml up -d prometheus grafana

echo
echo "4. Status dos servicos"
docker compose ps
docker compose -f docker-compose.monitoring.yml ps

echo
echo "5. Teste rapido de health"
docker compose exec -T redis redis-cli PING
docker compose exec -T backend sh -c 'curl -f http://localhost:3100/api/health || true'
curl -fsS http://localhost:9090/-/ready >/dev/null || true
curl -fsS http://localhost:3002/api/health >/dev/null || true

echo
echo "Deploy concluido."
