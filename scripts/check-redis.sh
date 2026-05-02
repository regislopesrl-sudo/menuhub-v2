#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

print_step() {
  echo
  echo "$1"
}

print_step "1. Status dos serviços via docker compose"
docker compose ps

print_step "2. PING dentro do serviço redis"
docker compose exec -T redis redis-cli PING

print_step "3. Procurando REDIS_HOST/REDIS_PORT nos arquivos"
for FILE in docker-compose.yml docker-compose.prod.yml; do
  if [ -f "$FILE" ]; then
    echo "--- $FILE ---"
    grep -nE 'REDIS_HOST|REDIS_PORT' "$FILE" || true
  fi
done

print_step "4. Teste com ioredis dentro do backend"
docker compose exec -T backend sh -c '\
  node -e "const Redis=require(\"ioredis\"); const redis=new Redis({ host: process.env.REDIS_HOST||\"redis\", port: Number(process.env.REDIS_PORT||6379) }); redis.ping().then(console.log).catch((err)=>{ console.error(\"PING falhou\", err.message); process.exit(1); }).finally(()=>redis.disconnect());"
'

print_step "Redis check concluído."
