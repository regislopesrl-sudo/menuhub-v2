# Desenvolvimento Local V2 (Sem Docker)

Este guia descreve como rodar o V2 localmente com Node.js e npm.

## Requisitos

- Node.js 20 LTS ou superior
- npm 10 ou superior
- PostgreSQL acessivel localmente (ou remoto), sem obrigatoriedade de Docker

## Instalar dependencias

Na raiz do repositorio:

```bash
npm install
```

## .env local da API V2

Arquivo: `apps/api-v2/.env`

Voce pode copiar de `apps/api-v2/.env.example` e ajustar:

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

## .env local da WEB V2

Arquivo: `apps/web-v2/.env.local`

Exemplo recomendado para desenvolvimento local:

```env
NODE_ENV=development
PORT=3112
NEXT_PUBLIC_API_V2_URL=http://localhost:3202
NEXT_PUBLIC_API_V2_WS_URL=http://localhost:3202
NEXT_PUBLIC_MOCK_COMPANY_ID=company-demo
NEXT_PUBLIC_MOCK_BRANCH_ID=branch-demo
```

## Comandos de build

Na raiz:

```bash
npm run build --workspace @delivery-futuro/api-v2
npm run build --workspace @delivery-futuro/web-v2
```

## Comandos de desenvolvimento

API V2 (terminal 1):

```bash
npm run prisma:generate
npm run db:push
npm run build --workspace @delivery-futuro/api-v2
npm run start --workspace @delivery-futuro/api-v2
```

WEB V2 (terminal 2):

```bash
npm run dev --workspace @delivery-futuro/web-v2
```

## Observacao sobre Docker

Docker nao e necessario para desenvolvimento local do V2.

No V2, Docker e utilizado apenas em ambientes de servidor (HML/PRD), para empacotamento e execucao da stack nesses ambientes.
