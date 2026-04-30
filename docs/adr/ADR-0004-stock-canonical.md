# ADR 0004: `stock` como namespace canônico, `inventory` como naming/legado

Data: 2026-04-20

## Status

Aceito

## Contexto

O domínio de estoque ainda mistura dois vocabulos no backend:

- `stock` como namespace HTTP exposto
- `inventory` como naming interno e historico legado, sem policy ativa de depreciação nesta fase

Isso pode gerar ambiguidade arquitetural se novas rotas, controllers ou aliases surgirem fora de uma regra explicita.

Hoje o código e os testes já praticam a convergencia para `stock` como contrato publico.

## Decisao

O namespace canônico do contrato HTTP de estoque e `stock`.

O `StockController` e o owner do contrato HTTP de stock e atende o namespace canônico:

- `GET /api/v1/stock/items`
- `GET /api/v1/stock/items/:id`
- `POST /api/v1/stock/items`
- `PATCH /api/v1/stock/items/:id`
- `GET /api/v1/stock/batches`
- `GET /api/v1/stock/movements`
- `POST /api/v1/stock/batches`
- `POST /api/v1/stock/movements`
- `POST /api/v1/stock/adjustments`
- `POST /api/v1/stock/waste`
- `GET /api/v1/stock/variance`
- `GET /api/v1/stock/replenishment/suggestions`
- `GET /api/v1/stock/dashboard`

O termo `inventory` permanece apenas como:

- naming interno em serviços, eventos, permissões e integrações legadas;
- alias legado na policy de depreciação para rotas antigas;
- vocabulário historico, sem virar novo namespace HTTP canônico.

## Consequencias

- Novas rotas HTTP de estoque devem nascer em `stock`.
- Alias e naming com `inventory` nao devem introduzir handlers concorrentes nem policy ativa.
- A convergencia de rotas de estoque deve ser protegida por testes e pela policy de legado.
- Se houver necessidade de novo alias, ele deve ser tratado como compatibilidade temporaria, nao como novo owner.

## Limites

- Nao criar novo namespace HTTP `inventory`.
- Nao duplicar o mesmo `method + path` entre `stock` e `inventory`.
- Mudancas no dominio de estoque devem preservar a compatibilidade do contrato atual.

## Referencias

- [apps/backend/src/modules/stock/stock.controller.ts](../../apps/backend/src/modules/stock/stock.controller.ts)
- [apps/backend/src/common/http/legacy-routes.ts](../../apps/backend/src/common/http/legacy-routes.ts)
- [apps/backend/src/common/http/legacy-routes.spec.ts](../../apps/backend/src/common/http/legacy-routes.spec.ts)
- [apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts](../../apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts)

## Notas

Este ADR apenas formaliza a decisao arquitetural ja refletida pelo codigo e pelos testes. Ele nao altera runtime, controllers, services ou guards.
