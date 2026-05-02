# Developer Role V2

## Objetivo
- Restringir a gestao de modulos da V2 apenas ao desenvolvedor da plataforma.

## Backend (`apps/api-v2`)
- Novo role aceito no contexto: `developer`.
- Helpers:
  - `isDeveloper(ctx)`
  - `requireDeveloper(ctx)`
- `PATCH /v2/companies/current/modules/:moduleKey` exige `x-user-role=developer`.
- `admin` e `master` ficam bloqueados nesse endpoint.
- Novo endpoint:
  - `POST /v2/developer/login`
  - body: `{ "accessCode": "..." }`
  - valida `DEVELOPER_ACCESS_CODE`
  - sucesso retorna sessao temporaria com `role=developer` e `expiresAt`.

## Frontend (`apps/web-v2`)
- Nova tela `/developer-login` para login por codigo.
- Login chama `POST /v2/developer/login`.
- Sessao developer temporaria salva em `sessionStorage`.
- `/admin/modules`:
  - valida sessao developer no `sessionStorage`
  - bloqueia nao developer com mensagem `Area tecnica restrita`
  - envia `x-user-role=developer`
  - mostra aviso: `Area tecnica restrita ao desenvolvedor da plataforma.`
  - adiciona botao `Sair` para limpar sessao.
- Home/Admin dashboard so mostram atalho de `Gestao de Modulos` quando houver sessao developer.

## Variaveis de ambiente
- `DEVELOPER_ACCESS_CODE` adicionada em:
  - `apps/api-v2/.env.example`
  - `apps/api-v2/.env.hml.example`
  - `apps/api-v2/.env.prd.example`

## Cenarios de teste
- Developer consegue acessar e alternar modulos.
- `admin` e `master` recebem bloqueio no `PATCH`.
- Login com codigo valido funciona.
- Login com codigo invalido e bloqueado.
