# Local Run (V2)

Este guia prepara o V2 para rodar 100% localmente, sem deploy e sem usar secrets reais.

## Pre-requisitos

- Node.js 20+
- npm 10+
- PostgreSQL acessivel localmente

Opcional para banco local com Docker:

```bash
docker compose -f docker-compose.hml.yml up -d postgres-v2
```

## Workspaces do monorepo

- `@delivery-futuro/api-v2`
- `@delivery-futuro/web-v2`
- `@delivery-futuro/shared-types`
- `@delivery-futuro/order-core`
- `@delivery-futuro/tsconfig`

## Variaveis de ambiente (somente exemplos)

### API (`apps/api-v2/.env`)

Copie de `apps/api-v2/.env.example`:

```env
NODE_ENV=development
PORT=3202
DATABASE_URL=postgresql://menuhub:menuhub@localhost:5432/menuhub_v2
CORS_ORIGIN=http://localhost:3112
SOCKET_CORS_ORIGIN=http://localhost:3112
DEFAULT_COMPANY_ID=company-demo
DEFAULT_BRANCH_ID=branch-demo
DEVELOPER_ACCESS_CODE=change_me_dev_code
```

### WEB (`apps/web-v2/.env.local`)

Copie de `apps/web-v2/.env.example`:

```env
NODE_ENV=development
PORT=3112
NEXT_PUBLIC_API_V2_URL=http://localhost:3202
NEXT_PUBLIC_API_V2_WS_URL=http://localhost:3202
NEXT_PUBLIC_MOCK_COMPANY_ID=company-demo
NEXT_PUBLIC_MOCK_BRANCH_ID=branch-demo
```

## Ordem para subir local

1. Instalar dependencias:

```bash
npm install
```

2. Gerar cliente Prisma e aplicar schema:

```bash
npm run prisma:generate
npm run db:push
```

3. Build dos pacotes base (quando necessario):

```bash
npm run build --workspace @delivery-futuro/shared-types
npm run build --workspace @delivery-futuro/order-core
```

4. Build das apps:

```bash
npm run build --workspace @delivery-futuro/api-v2
npm run build --workspace @delivery-futuro/web-v2
```

5. Subir API:

```bash
npm run start --workspace @delivery-futuro/api-v2
```

6. Subir WEB (novo terminal):

```bash
npm run dev --workspace @delivery-futuro/web-v2
```

## Portas

- API V2: `3202`
- WEB V2 (dev): `3112`
- Postgres local: `5432` (ou a que voce configurar no `DATABASE_URL`)

## Build e Test

```bash
npm run build --workspace @delivery-futuro/web-v2
npm run build --workspace @delivery-futuro/api-v2
npm run test --workspace @delivery-futuro/api-v2 -- --runInBand
```

## Troubleshooting

- Erro `Cannot find module 'class-validator'` ou `class-transformer`:
  - instale no workspace `api-v2`:
  - `npm install --workspace @delivery-futuro/api-v2 class-validator class-transformer`

- Erro de Prisma/tipos (`OrderStatus`):
  - rode `npm run prisma:generate` e depois refaca o build.

- Erros de conexao no banco:
  - revise `DATABASE_URL` e confirme se o Postgres esta acessivel.

- Se o build da API falhar por tipagem residual:
  - valide se voce esta com a branch `sync/server-latest-fixes` atualizada e rode novamente `npm install`.
