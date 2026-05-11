# Prisma local, baseline e banco descartavel

Este documento registra a estrategia do MenuHub V2 para usar Prisma localmente sem misturar banco descartavel com HML, producao ou servidor.

## Estado atual

O historico atual de migrations nasceu a partir de um banco que ja existia. A primeira migration, `20260501000000_baseline_existing_hml_schema`, e intencionalmente vazia e serve como baseline historico para um schema pre-existente.

Isso significa que o historico atual nao cria um banco novo do zero com `migrate deploy`.

O caminho quebrado em banco vazio e:

```text
banco vazio
-> baseline vazia
-> migration 20260502120000_add_product_available_kiosk
-> ALTER TABLE products
-> products nao existe
-> falha
```

## Regra principal

```text
migrate deploy e para bancos com historico compativel.
db push so pode ser usado em banco local descartavel.
```

Nunca usar `db push` em HML, producao, servidor ou banco com dados importantes.

## Scripts locais padronizados

No root do repositorio:

```powershell
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:status
npm run prisma:migrate:deploy
npm run prisma:db:push:local
```

No workspace da API:

```powershell
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
npm run prisma:migrate:status --workspace @delivery-futuro/api-v2
npm run prisma:migrate:deploy --workspace @delivery-futuro/api-v2
npm run prisma:db:push:local --workspace @delivery-futuro/api-v2
```

Esses comandos carregam `apps/api-v2/.env` e `apps/api-v2/.env.local` via `apps/api-v2/scripts/prisma-with-env.mjs`.

## Uso seguro em ambiente local

Para validar schema e client:

```powershell
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
```

Para inspecionar historico de migrations:

```powershell
npm run prisma:migrate:status --workspace @delivery-futuro/api-v2
```

Se o banco local for descartavel e voce souber que pode recriar dados, o bootstrap local aceito no curto prazo e:

```powershell
npm run prisma:db:push:local --workspace @delivery-futuro/api-v2
npm run seed:local --workspace @delivery-futuro/api-v2
```

Antes de usar `prisma:db:push:local`, confirme:

```text
[ ] DATABASE_URL aponta para banco local.
[ ] Banco nao e HML.
[ ] Banco nao e producao.
[ ] Banco nao contem dados importantes.
[ ] O objetivo e apenas destravar ambiente local descartavel.
```

## O que nao fazer

```text
Nao usar prisma db push em HML.
Nao usar prisma db push em producao.
Nao usar prisma migrate reset sem autorizacao explicita.
Nao usar prisma migrate resolve sem plano documentado.
Nao editar migrations antigas as cegas.
Nao criar migration gigante para resolver varios blocos ao mesmo tempo.
Nao misturar upgrade Prisma com models novos.
```

## Estrategia recomendada

### Curto prazo

Usar `prisma:db:push:local` somente para banco local descartavel e documentar isso explicitamente.

### Medio prazo

Criar uma estrategia de bootstrap local mais previsivel, por exemplo:

- dump local sanitizado;
- baseline local consolidado;
- ou migration baseline autossuficiente para banco novo.

Essa decisao deve ser feita em PR propria, sem misturar com blocos funcionais.

### Longo prazo

Ter migrations autossuficientes, pequenas e por dominio, de forma que um banco novo consiga subir com `migrate deploy` em ambiente controlado.

## Checklist antes de alterar schema

```text
[ ] A alteracao pertence a um unico bloco/dominio.
[ ] A migration planejada e pequena.
[ ] Nao depende de estado invisivel de banco antigo.
[ ] Existe validacao local planejada.
[ ] Nao altera dados sensiveis sem plano.
[ ] Nao mistura Prisma 7 com model novo.
```

## Validacoes minimas apos mudancas Prisma

```powershell
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
npm run build --workspace @delivery-futuro/api-v2
npm run test --workspace @delivery-futuro/api-v2 -- --runInBand
```
