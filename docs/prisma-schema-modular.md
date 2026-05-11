# Prisma schema modular por dominio

O schema Prisma do MenuHub V2 esta organizado em `apps/api-v2/prisma/schema`.

O arquivo `schema.prisma` dentro dessa pasta e apenas o entrypoint com `generator` e `datasource`.
Os models e enums ficam em arquivos separados por dominio.

## Estrutura

```text
apps/api-v2/prisma/schema/
  schema.prisma
  00_enums.prisma
  01_core_company_branch.prisma
  02_auth_rbac.prisma
  03_platform_billing.prisma
  04_catalog_menu.prisma
  05_delivery_customers.prisma
  06_tables_waiter_kiosk.prisma
  07_orders_timeline.prisma
  08_finance.prisma
  09_inventory_procurement.prisma
  10_recipe_production.prisma
  11_fiscal.prisma
  12_realtime.prisma
  13_integrations_future.prisma
  14_imports.prisma
```

## Regras

Nao criar migration apenas para mover models entre arquivos.
Nao mudar nome de model, enum, campo, relation, indice ou `@@map` durante reorganizacao.
Nao misturar reorganizacao do schema com mudanca funcional de dominio.
Nao criar arquivos por ambiente, como `schema.hml.prisma` ou `schema.production.prisma`.

## Comandos

Use sempre os scripts do workspace, que apontam para a pasta `prisma/schema` e carregam o `.env` local:

```powershell
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
npm run prisma:migrate:status --workspace @delivery-futuro/api-v2
```

