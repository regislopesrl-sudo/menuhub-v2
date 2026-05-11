# Estrategia de migrations futuras

Este documento define como o MenuHub V2 deve evoluir o banco de dados a partir do schema modular em `apps/api-v2/prisma/schema`.

## Regra principal

Cada mudanca de banco deve pertencer a um unico bloco funcional e gerar uma migration pequena, nomeada e revisavel.

Nao criar migration gigante para varios dominios ao mesmo tempo.

## Estado atual importante

O historico atual tem uma baseline vazia em `20260501000000_baseline_existing_hml_schema`.

Isso significa que o historico de migrations ainda nao e autossuficiente para criar um banco novo do zero com `migrate deploy`.

Enquanto essa situacao existir:

- `migrate deploy` deve ser usado apenas em bancos com historico compativel.
- `prisma:db:push:local` so pode ser usado em banco local descartavel.
- novas migrations devem ser pequenas e incrementais.
- migrations antigas nao devem ser editadas sem plano explicito.

## Fluxo recomendado para um bloco com banco

1. Auditar o schema modular atual.
2. Identificar o arquivo de dominio correto.
3. Desenhar models/campos minimos para o bloco.
4. Alterar apenas o dominio necessario.
5. Gerar migration pequena e nomeada.
6. Revisar SQL gerado antes de aplicar.
7. Rodar `prisma validate`.
8. Rodar `prisma generate`.
9. Rodar build e testes do backend.
10. Documentar impacto e rollback logico.

## Nome de migrations

Use nomes curtos, em ingles tecnico, com um unico objetivo.

Exemplos:

```text
add_audit_log_events
add_inventory_core
add_stock_batches
add_recipe_core
add_purchase_orders
add_finance_reconciliation
add_order_refunds
add_kiosk_sessions
add_waiter_table_sessions
```

## Padrao por dominio

### SaaS / Platform

Arquivos esperados:

- `03_platform_billing.prisma`
- `11_audit_logs.prisma`, quando houver audit trail administrativo dedicado

Migrations devem separar billing, plans, subscriptions, audit e permissions quando possivel.

### Catalogo / Cardapio

Arquivo esperado:

- `04_catalog_menu.prisma`

Nao misturar catalogo com estoque ou ficha tecnica na mesma migration.

### Ficha tecnica / Producao

Arquivo esperado:

- `10_recipe_production.prisma`

Separar receita, composicao, producao e consumo quando o impacto for grande.

### Estoque / Compras

Arquivo esperado:

- `09_inventory_procurement.prisma`

Separar estoque core, lotes, movimentacoes, fornecedores, pedidos de compra e recebimento quando possivel.

### Financeiro

Arquivo esperado:

- `08_finance.prisma`

Separar contas a pagar, contas a receber, conciliacao e fechamento financeiro.

### Pedidos / Operacao

Arquivo esperado:

- `07_orders_timeline.prisma`

Separar refunds, status/timeline, idempotencia e pagamentos operacionais quando possivel.

### Mesas / Garcom / Totem

Arquivo esperado:

- `06_tables_waiter_kiosk.prisma`

Separar mesa/comanda, waiter app, kiosk e reservas quando o bloco crescer.

### Realtime

Arquivo esperado:

- `12_realtime.prisma`

Nao misturar outbox/retry/socket session com pedidos ou financeiro.

## Checklist antes de criar migration

```text
[ ] A mudanca pertence a um unico bloco.
[ ] O arquivo de dominio correto foi identificado.
[ ] A migration tem nome pequeno e objetivo.
[ ] O SQL gerado foi revisado.
[ ] Nao altera migrations antigas.
[ ] Nao usa db push como substituto.
[ ] Nao usa migrate reset.
[ ] Nao mistura dados sensiveis sem plano.
[ ] Existe teste ou validacao local associada.
```

## Comandos seguros

Validacao sem alterar banco:

```powershell
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
```

Inspecao de status:

```powershell
npm run prisma:migrate:status --workspace @delivery-futuro/api-v2
```

## Proibido como padrao

```text
Nao criar migration gigante.
Nao misturar Estoque + Financeiro + Ficha Tecnica na mesma migration.
Nao editar migrations antigas sem plano.
Nao usar db push fora de banco local descartavel.
Nao usar migrate reset como solucao generica.
Nao usar migrate resolve sem entender impacto.
Nao tratar HML/producao/servidor dentro de bloco local.
```

## Criterios de aceite para PRs com migration

```text
prisma validate OK
prisma generate OK
build api-v2 OK
test api-v2 OK
SQL da migration revisado
impacto documentado
sem deploy
sem alteracao de servidor
```

