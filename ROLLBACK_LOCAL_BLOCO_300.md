# ROLLBACK_LOCAL_BLOCO_300

## Contexto

Este documento descreve rollback local/DEV para o Bloco 300.

O rollback deve ser usado somente se houver falha critica no DEV apos aplicacao do bloco.

## Backups disponiveis

Backups relevantes criados no DEV:

- `/home/deploy/menuhub-v2-dev/backups/menuhub_dev_shared_before_300d.dump`
- `/home/deploy/menuhub-v2-dev/backups/menuhub_dev_shared_before_300e.dump`
- `/home/deploy/menuhub-v2-dev/backups/menuhub_dev_shared_before_300f_final_qa.dump`

## Rollback de banco DEV via pg_restore

Exemplo usando o backup final do 300F:

```bash
docker cp /home/deploy/menuhub-v2-dev/backups/menuhub_dev_shared_before_300f_final_qa.dump menuhub-postgres-v2-dev:/tmp/menuhub_dev_shared_before_300f_final_qa.dump

docker exec menuhub-postgres-v2-dev sh -lc '
  dropdb -U postgres menuhub_dev_shared --if-exists &&
  createdb -U postgres menuhub_dev_shared &&
  pg_restore -U postgres -d menuhub_dev_shared --clean --if-exists /tmp/menuhub_dev_shared_before_300f_final_qa.dump
'
```

Antes de executar, confirmar que o alvo e `menuhub-postgres-v2-dev`.

## Rollback de branch Git

Sem usar `reset --hard` automaticamente.

Opcoes seguras:

```bash
git status --short
git log --oneline -20
git revert <commit>
```

Se for necessario retornar para um commit anterior em ambiente DEV, confirmar manualmente o commit alvo e registrar a decisao.

## O que nao deve ser feito

- Nao rodar rollback contra HML ou PRD.
- Nao rodar `migrate reset`.
- Nao rodar `db push`.
- Nao apagar backups.
- Nao expor senha de banco em logs.

## Criterios para acionar rollback

- API nao sobe apos correcao simples.
- Prisma Client/schema inconsistente.
- Migration em estado aberto/falhado.
- Dados DEV corrompidos.
- Falha critica em login, pedidos ou catalogo no DEV.

## Passos de validacao pos-rollback

```bash
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:migrate:status --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
node ./node_modules/typescript/bin/tsc -p apps/api-v2/tsconfig.json
curl -fsS http://127.0.0.1:3202/v2/health
```

Validar tambem login, catalogo, estoque, compras, financeiro e relatorios no DEV.
