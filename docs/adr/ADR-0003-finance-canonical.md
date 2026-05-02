# ADR 0003: `finance` como namespace canÃ´nico, `financial` como naming/legado

Data: 2026-04-20

## Status

Aceito

## Contexto

O domÃ­nio financeiro ainda mistura dois vocabulos no backend:

- `finance` como namespace HTTP exposto
- `financial` como naming interno e historico legado, sem policy ativa de depreciação nesta fase de rotas
- aliases flat como `cash-registers`, `cash-movements`, `accounts-payable` e `accounts-receivable` como historico legado, sem policy ativa de depreciação nesta fase de rotas

Isso pode gerar ambiguidade arquitetural se novas rotas, controllers ou aliases surgirem fora de uma regra explicita.

Hoje o cÃ³digo e os testes jÃ¡ praticam a convergencia para `finance` como contrato publico.

## Decisao

O namespace canÃ´nico do contrato HTTP financeiro e `finance`.

O `FinanceController` e o owner do contrato HTTP de finance e atende o namespace canÃ´nico:

- `GET /api/v1/finance/cash-registers`
- `POST /api/v1/finance/cash-registers/open`
- `POST /api/v1/finance/cash-registers/:id/close`
- `POST /api/v1/finance/cash-movements`
- `POST /api/v1/finance/cash-movements/:id/reversals`
- `GET /api/v1/finance/accounts-payable`
- `POST /api/v1/finance/accounts-payable`
- `POST /api/v1/finance/accounts-payable/:id/settlements`
- `GET /api/v1/finance/accounts-receivable`
- `POST /api/v1/finance/accounts-receivable`
- `POST /api/v1/finance/accounts-receivable/:id/settlements`
- `GET /api/v1/finance/dashboard`
- `GET /api/v1/finance/reconciliations`
- `POST /api/v1/finance/reconciliations`
- `GET /api/v1/finance/daily-closures`
- `POST /api/v1/finance/daily-closures`
- `POST /api/v1/finance/maintenance/mark-overdue`
- `POST /api/v1/finance/maintenance/reconcile`
- `GET /api/v1/finance/maintenance/status`

O termo `financial` permanece apenas como:

- naming interno em serviÃ§os, DTOs e permissÃµes;
- naming historico sem policy ativa para rotas antigas;
- vocabulÃ¡rio historico, sem virar novo namespace HTTP canÃ´nico.

## Consequencias

- Novas rotas HTTP financeiras devem nascer em `finance`.
- Alias e naming com `financial` e aliases flat nao devem introduzir handlers concorrentes nem policy ativa.
- A convergencia de rotas financeiras deve ser protegida por testes e pela policy de legado.
- Se houver necessidade de novo alias, ele deve ser tratado como compatibilidade temporaria, nao como novo owner.

## Limites

- Nao criar novo namespace HTTP `financial`.
- Nao duplicar o mesmo `method + path` entre `finance` e `financial`.
- Mudancas no dominio financeiro devem preservar a compatibilidade do contrato atual.

## Referencias

- [apps/backend/src/modules/financial/finance.controller.ts](../../apps/backend/src/modules/financial/finance.controller.ts)
- [apps/backend/src/common/http/legacy-routes.ts](../../apps/backend/src/common/http/legacy-routes.ts)
- [apps/backend/src/common/http/legacy-routes.spec.ts](../../apps/backend/src/common/http/legacy-routes.spec.ts)
- [apps/backend/src/contracts/financial-input-contract.e2e.spec.ts](../../apps/backend/src/contracts/financial-input-contract.e2e.spec.ts)
- [apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts](../../apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts)

## Notas

Este ADR apenas formaliza a decisao arquitetural ja refletida pelo codigo e pelos testes. Ele nao altera runtime, controllers, services ou guards.



