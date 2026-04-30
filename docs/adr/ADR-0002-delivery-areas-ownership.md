# ADR 0002: Ownership de `delivery/areas` e alias `delivery-areas`

Data: 2026-04-20

## Status

Aceito

## Contexto

O dominio de `delivery` ainda carrega um alias historico para areas de entrega, usando `delivery-areas` ao lado do namespace canonico `delivery/areas`.

Hoje o backend ja pratica uma convergencia explicita para `delivery/areas`, enquanto a policy de legado nao cobre mais a familia `delivery-areas/*` nesta fase e o runtime residual dessa familia foi removido neste corte. Os testes automatizados cobrem a paridade do namespace canonico e a ausencia de runtime legado para esses caminhos.

Este ADR cobre apenas o subconjunto de rotas de areas de entrega exposto pelo `DeliveryController`. Outros endpoints de delivery, como couriers, deliveries, lookup/resolve de CEP e cobertura publica, ficam fora deste escopo.

## Decisao

O namespace canonico de areas de entrega e `delivery/areas`.

O `DeliveryController` e o owner do contrato publico de areas de entrega e atende os caminhos canonicos:

- `GET /api/v1/delivery/areas`
- `GET /api/v1/delivery/areas/:id`
- `POST /api/v1/delivery/areas`
- `PATCH /api/v1/delivery/areas/:id`
- `DELETE /api/v1/delivery/areas/:id`
- `POST /api/v1/delivery/areas/:id/polygons`
- `GET /api/v1/delivery/areas/:id/polygons`
- `DELETE /api/v1/delivery/areas/polygons/:polygonId`
- `POST /api/v1/delivery/areas/:id/fee-rules`
- `GET /api/v1/delivery/areas/:id/fee-rules`
- `DELETE /api/v1/delivery/areas/fee-rules/:ruleId`

O alias historico `delivery-areas` foi removido do runtime. O namespace canonico de areas de entrega continua em `delivery/areas`, sem compatibilidade residual nesta familia.

## Consequencias

- Novas rotas relacionadas a areas de entrega devem usar `delivery/areas`.
- Nao devem ser adicionados novos handlers concorrentes em `delivery-areas`.
- Mudancas no namespace devem manter paridade entre alias e canonico enquanto o alias continuar ativo.
- Os testes de contrato e a policy de legado sao a protecao operacional dessa decisao.
- `delivery-areas/*` foi removido do runtime neste corte; `resolve-by-point` ja havia sido removido em corte separado e `POST /api/v1/public/delivery/coverage/coordinates` segue como canônico público.

## Limites

- `delivery-areas` nao deve se expandir como namespace novo ou paralelo.
- Qualquer nova rota publica de delivery precisa ser discutida explicitamente antes de ser adicionada.
- A remocao dos aliases restantes foi concluida neste corte.

## Referencias

- [apps/backend/src/modules/delivery/delivery.controller.ts](../../apps/backend/src/modules/delivery/delivery.controller.ts)
- [apps/backend/src/common/http/legacy-routes.ts](../../apps/backend/src/common/http/legacy-routes.ts)
- [apps/backend/src/common/http/legacy-routes.spec.ts](../../apps/backend/src/common/http/legacy-routes.spec.ts)
- [apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts](../../apps/backend/src/contracts/legacy-http-parity.e2e.spec.ts)

## Notas

Este ADR formaliza a convergencia ja implementada no codigo e protegida pelos testes. Ele nao altera runtime, controllers, services ou guards.
