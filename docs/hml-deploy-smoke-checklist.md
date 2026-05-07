# Checklist HML Deploy e Smoke Test

## Antes do deploy
- Confirmar branch `main` atualizada (`git checkout main && git pull origin main`).
- Confirmar commit esperado para a janela de deploy.
- Confirmar build e testes locais verdes antes de subir.
- Confirmar que nao ha `.env` ou secrets versionados.
- Confirmar status de migrations pendentes.
- Confirmar acesso ao servidor HML.
- Confirmar backup obrigatorio antes de qualquer migration.

## Backup
Executar backup do Postgres HML antes de migrations:

```bash
# Exemplo (ajuste host/usuario/db no servidor HML)
export PGPASSWORD="$POSTGRES_PASSWORD"
pg_dump -h <HML_DB_HOST> -p 5432 -U <HML_DB_USER> -d <HML_DB_NAME> \
  -F c -f backup_hml_$(date +%Y%m%d_%H%M%S).dump

# Opcional: validar arquivo
ls -lh backup_hml_*.dump
```

Boas praticas:
- Salvar backup com timestamp.
- Guardar em local seguro antes de prosseguir.
- Nao sobrescrever backup anterior sem necessidade.

## Atualizacao do codigo
```bash
git status
git stash -u   # somente se houver alteracoes locais necessarias
git pull origin main
```

## Migrations
```bash
npx prisma migrate status --schema apps/api-v2/prisma/schema.prisma
npx prisma migrate deploy --schema apps/api-v2/prisma/schema.prisma
```

Regras:
- Nao usar `prisma migrate dev` em HML.
- Nao usar `prisma db push` em HML.

## Rebuild
```bash
# Exemplo com compose HML
docker compose -f docker-compose.hml.yml build api-v2 web-v2
docker compose -f docker-compose.hml.yml up -d api-v2 web-v2
```

Se necessario (problema de bundle/assets):
```bash
# Limpeza controlada de cache/build do web
rm -rf apps/web-v2/.next
```

## Smoke API
Validar endpoints essenciais:
- `GET /v2/health`
- login Auth/developer (se aplicavel no ambiente)
- `GET /v2/companies/current/modules`
- `GET /v2/billing/current`
- `GET /v2/settings/company`
- `GET /v2/orders?limit=5`

## Smoke Web
Validar paginas:
- `/`
- `/admin`
- `/admin/settings`
- `/admin/billing`
- `/admin/orders`
- `/admin/menu`
- `/admin/pdv`
- `/admin/kds`
- `/admin/users`
- `/admin/modules`
- `/developer-login`
- `/developer/companies`
- `/developer/plans`
- `/delivery`

## Smoke Next assets
Validar em rede/browser:
- CSS de `/_next/static` com HTTP 200.
- Chunk JS atual com HTTP 200.
- Sem HTTP 400 em assets estaticos.

## Logs
Verificar:
- `api-v2` sem erro de Prisma/DI.
- `web-v2` sem chunk 404.
- Nginx sem 502/504.
- WebSocket/socket.io funcionando (se aplicavel).

## Rollback
Fluxo recomendado:
1. Voltar para commit anterior estavel.
2. Rebuild/restart dos servicos.
3. Restaurar backup apenas se migration quebrou dados.
4. Nunca restaurar ambiente PRD por engano durante incidente HML.

## Proibido em HML
- `prisma migrate dev`
- `prisma db push`
- apagar volumes sem plano formal
- commitar `.env`
- expor secrets reais em logs
