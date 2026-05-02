# ADR 0005: `stock/waste` e `stock/variance` como rotas canônicas

Data: 2026-04-20

## Status

Aceito

## Contexto

O `StockController` expõe pares de rotas com o mesmo comportamento interno, mas com nomes diferentes:

- `waste` e `waste-records` (com `waste-records` removida da policy ativa nesta fase)
- `variance` e `variances` (com `variances` removida da policy ativa nesta fase)

Para reduzir ambiguidade arquitetural futura, esta documentação formaliza qual forma deve ser tratada como canônica e qual deve ser entendida como alias funcional/legado.

## Decisão

As rotas canônicas do domínio neste recorte são:

- `POST /api/v1/stock/waste`
- `GET /api/v1/stock/variance`

Os aliases funcionais/legados correspondentes foram mantidos apenas até a fase anterior:

- `POST /api/v1/stock/waste-records`
- `GET /api/v1/stock/variances`

## Consequências

- Novos consumidores devem preferir as rotas canônicas.
- O alias `waste-records` deixou de fazer parte da policy ativa desta fase.
- O alias `variances` deixou de fazer parte da policy ativa desta fase.
- A rota `variance` segue como canônica única neste recorte.
- Qualquer futura convergência ou remoção de aliases remanescentes deve preservar paridade funcional e ser acompanhada por testes antes de qualquer bloqueio.

## Limites

- Esta decisão não altera comportamento, controllers, services ou guards.
- Esta decisão não amplia o escopo para outras rotas de `stock`.
- Esta decisão registra a remoção desses aliases da policy ativa desta fase.

## Referências

- [apps/backend/src/modules/stock/stock.controller.ts](../../apps/backend/src/modules/stock/stock.controller.ts)

## Notas

O `StockController` mantém `waste` como rota canônica de criação de descarte e `variance` como consulta canônica única. `waste-records` e `variances` permaneceram como legado apenas até a fase anterior e não fazem mais parte da policy ativa desta fase.
