# HML Deploy Checklist - MenuHub V2

## 1. Pre-deploy

- Confirmar janela de deploy e responsável de plantão.
- Confirmar branch `main` atualizada e review aprovado.
- Confirmar `git status` limpo no servidor.
- Confirmar backup de banco HML concluído (obrigatório).
- Confirmar variáveis de ambiente HML carregadas.

## 2. Backup obrigatório

Antes de qualquer migration:

- Backup lógico/físico do PostgreSQL HML.
- Validar integridade do backup.
- Registrar timestamp e responsável.

Sem backup confirmado, **não executar deploy**.

## 3. Deploy com script seguro

No servidor HML:

```bash
cd /home/deploy/menuhub-v2
chmod +x scripts/deploy-hml.sh scripts/rollback-hml.sh
PROJECT_DIR=/home/deploy/menuhub-v2 ./scripts/deploy-hml.sh
```

O script executa:

1. valida branch main
2. valida working tree limpa
3. `git fetch` + `git pull origin main`
4. confirmação manual de backup (`BACKUP_OK`)
5. valida `docker compose config`
6. build de `api-v2` e `web-v2`
7. `prisma validate`
8. `prisma migrate status`
9. `prisma migrate deploy`
10. `up -d --no-deps api-v2 web-v2`
11. logs finais + healthcheck

## 4. Smoke tests pós-deploy

- Health:
  - `curl -fsS http://localhost:3202/v2/health`
- Login técnico:
  - `/developer-login`
- Fluxos SaaS:
  - `/developer/companies`
  - assinatura
  - módulos
  - billing
- Premium admin:
  - `/admin`
  - `/admin/modules`
- Webhook/payment:
  - validar idempotência e retry seguro
- Logs:
  - sem erro Prisma/Nest crítico por 5–10 min

## 5. Rollback (aplicação)

Exemplo:

```bash
cd /home/deploy/menuhub-v2
TARGET_COMMIT=<commit_hash> PROJECT_DIR=/home/deploy/menuhub-v2 ./scripts/rollback-hml.sh
```

Observações:

- Script **não** restaura banco automaticamente.
- Se houver incompatibilidade de schema, restaurar backup de banco compatível com `TARGET_COMMIT`.

## 6. Variáveis HML obrigatórias

API:

- `NODE_ENV=production`
- `APP_ENV=hml` (ou padrão equivalente do projeto)
- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `CORS_ORIGIN=https://<hml-web-url>`
- `ALLOW_HEADER_CONTEXT_FALLBACK=false`
- `PAYMENT_PROVIDER=mock` (até provider real)

WEB:

- `NEXT_PUBLIC_API_URL=https://<hml-api-url>/v2`
- `NEXT_PUBLIC_APP_ENV=hml`

## 7. Comandos proibidos

- `prisma db push`
- `prisma migrate reset`
- `docker compose down -v`
- `git reset --hard`
- `git push --force`
- alterações diretas em PRD durante procedimento HML
