# ADR 0006: `kitchen` como namespace canônico, `kds` como naming/legado

Data: 2026-04-20

## Status

Aceito

## Contexto

O dominio de cozinha ainda mistura dois vocabulos no backend:

- `kitchen` como namespace HTTP exposto
- `kds` como naming interno e historico legado, sem policy ativa de depreciacao nesta fase, alem de aparecer em realtime e permissoes historicas

Isso pode gerar ambiguidade arquitetural se novas rotas, controllers ou aliases surgirem fora de uma regra explicita.

Hoje o código e os testes já praticam a convergencia para `kitchen` como contrato publico.

## Decisao

O namespace canônico do contrato HTTP de cozinha e `kitchen`.

O `KitchenController` e o owner do contrato HTTP de kitchen e atende o namespace canônico:

- `GET /api/v1/kitchen/config`
- `PATCH /api/v1/kitchen/config`
- `GET /api/v1/kitchen/orders`
- `GET /api/v1/kitchen/stations/:station/orders`
- `GET /api/v1/kitchen/orders/:id`
- `PATCH /api/v1/kitchen/orders/:id/status`
- `GET /api/v1/kitchen/queue`
- `PATCH /api/v1/kitchen/orders/:id/start`
- `POST /api/v1/kitchen/orders/:id/start`
- `PATCH /api/v1/kitchen/orders/:id/mark-ready`
- `POST /api/v1/kitchen/orders/:id/mark-ready`
- `PATCH /api/v1/kitchen/orders/:id/finish`
- `POST /api/v1/kitchen/orders/:id/finish`
- `PATCH /api/v1/kitchen/orders/:id/reopen`
- `POST /api/v1/kitchen/orders/:id/reopen`
- `PATCH /api/v1/kitchen/order-items/:id/start`
- `POST /api/v1/kitchen/order-items/:id/start`
- `PATCH /api/v1/kitchen/order-items/:id/finish`
- `POST /api/v1/kitchen/order-items/:id/finish`
- `PATCH /api/v1/kitchen/order-items/:id/mark-ready`
- `POST /api/v1/kitchen/order-items/:id/mark-ready`

O termo `kds` permanece apenas como:

- naming interno em serviços, eventos, rooms e permissões historicas;
- naming historico sem policy ativa para rotas antigas;
- vocabulário historico, sem virar novo namespace HTTP canônico.

## Consequencias

- Novas rotas HTTP de cozinha devem nascer em `kitchen`.
- Alias e naming com `kds` nao devem introduzir handlers concorrentes nem policy ativa.
- A convergencia de rotas de cozinha deve ser protegida por testes e pela policy de legado.
- Se houver necessidade de novo alias, ele deve ser tratado como compatibilidade temporaria, nao como novo owner.

## Limites

- Nao criar novo namespace HTTP `kds`.
- Nao duplicar o mesmo `method + path` entre `kitchen` e `kds`.
- Mudancas no dominio de cozinha devem preservar a compatibilidade do contrato atual.

## Referencias

- [apps/backend/src/modules/kds/kitchen.controller.ts](../../apps/backend/src/modules/kds/kitchen.controller.ts)
- [apps/backend/src/common/http/legacy-routes.ts](../../apps/backend/src/common/http/legacy-routes.ts)
- [apps/backend/src/common/http/legacy-routes.spec.ts](../../apps/backend/src/common/http/legacy-routes.spec.ts)
- [apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts](../../apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts)

## Notas

Este ADR apenas formaliza a decisao arquitetural ja refletida pelo codigo e pelos testes. Ele nao altera runtime, controllers, services ou guards.


