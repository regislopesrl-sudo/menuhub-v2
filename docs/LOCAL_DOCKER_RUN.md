# MenuHubV2 Local Docker Run (Windows)

Guia para rodar localmente com Docker + Postgres + Prisma + API/Web, sem deploy e sem secrets reais.

## 1) Pre-requisitos

- Windows 10/11
- Node.js 20+
- npm 10+
- Docker Desktop para Windows

## 2) Instalar Docker Desktop (se ainda nao tiver)

No ambiente atual, `docker` nao foi encontrado no PATH.

Opcao via instalador oficial:
- Baixar: https://www.docker.com/products/docker-desktop/
- Instalar e abrir o Docker Desktop.

Opcao via `winget`:

```powershell
winget install -e --id Docker.DockerDesktop
```

Se o terminal pedir permissao de administrador/elevacao, execute exatamente este comando em PowerShell "Executar como administrador":

```powershell
winget install -e --id Docker.DockerDesktop
```

Depois da instalacao, confirme:

```powershell
docker --version
docker compose version
docker info
```

## 3) Configuracao de ambiente local (placeholders)

Arquivo raiz recomendado:

`C:\MenuHubV2\.env.local.example`

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/menuhub_v2?schema=public
```

API:
- Base: `apps/api-v2/.env.example`
- Copiar para `apps/api-v2/.env` e ajustar apenas localmente.

Web:
- Base: `apps/web-v2/.env.example`
- Copiar para `apps/web-v2/.env.local`.

## 4) Subir Postgres local com Docker

Arquivo local criado:

`docker-compose.local.yml`

Comandos:

```powershell
docker compose -f docker-compose.local.yml up -d
docker ps
```

Teste da porta:

```powershell
Test-NetConnection -ComputerName localhost -Port 5432
```

## 5) Dependencias locais

```powershell
npm install
npm install @nestjs/platform-socket.io --workspace @delivery-futuro/api-v2
```

## 6) Prisma

```powershell
npm run prisma:generate
npm run db:push
```

## 7) Build e testes

```powershell
npm run build --workspace @delivery-futuro/web-v2
npm run build --workspace @delivery-futuro/api-v2
npm run test --workspace @delivery-futuro/api-v2 -- --runInBand
```

## 8) Rodar API e Web local

Terminal 1 (API):

```powershell
npm run dev:api-v2
```

Terminal 2 (Web):

```powershell
npm run dev:web-v2
```

Portas:
- API: `3202`
- Web: `3112`
- Postgres: `5432`

Endpoints basicos:
- API health: `http://localhost:3202/v2/health`
- Web: `http://localhost:3112`

## 9) Troubleshooting

### Prisma P1001 / conexao localhost:5432

- Verifique se o Docker Desktop esta aberto.
- Rode `docker ps` e confirme o container postgres.
- Rode `Test-NetConnection localhost -Port 5432`.
- Valide `DATABASE_URL` local:
  - `postgresql://postgres:postgres@localhost:5432/menuhub_v2?schema=public`

### Falta `@nestjs/platform-socket.io`

```powershell
npm install @nestjs/platform-socket.io --workspace @delivery-futuro/api-v2
```

### Build TS da api-v2

- Rode `npm install`
- Rode `npm run prisma:generate`
- Rode `npm run build --workspace @delivery-futuro/api-v2`
- Se persistir, rode os testes para identificar arquivo:
  - `npm run test --workspace @delivery-futuro/api-v2 -- --runInBand`
