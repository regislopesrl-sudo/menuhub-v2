# ADRs de Convergencia

Esta pasta guarda ADRs curtos que formalizam decisoes arquiteturais de convergencia no backend.

Eles existem para:

- reduzir ambiguidade de naming, ownership e aliases;
- registrar a decisao arquitetural de forma versionada;
- refletir comportamento que ja esta protegido por codigo e testes;
- servir como referencia rapida para proximas mudancas de contrato.

## Como usar

- Crie um novo ADR quando uma decisao de convergencia precisar ficar explicita e navegavel.
- Atualize um ADR existente quando a decisao registrada mudar de fato.
- Sempre que uma mudanca afetar contrato, naming, ownership ou aliases, aponte para o ADR relevante.

## Indice

- [ADR-0001-public-orders-ownership.md](./ADR-0001-public-orders-ownership.md) - ownership de `public/orders` entre `checkout` e `orders-core`.
- [ADR-0002-delivery-areas-ownership.md](./ADR-0002-delivery-areas-ownership.md) - ownership de `delivery/areas` e alias `delivery-areas`.
- [ADR-0003-finance-canonical.md](./ADR-0003-finance-canonical.md) - `finance` como namespace canônico e `financial` como naming/legado.
- [ADR-0004-stock-canonical.md](./ADR-0004-stock-canonical.md) - `stock` como namespace canônico e `inventory` como naming/legado.
- [ADR-0005-stock-waste-variance-aliases.md](./ADR-0005-stock-waste-variance-aliases.md) - rotas canônicas e aliases funcionais de `stock` para `waste` e `variance`.
- [ADR-0006-kitchen-canonical.md](./ADR-0006-kitchen-canonical.md) - `kitchen` como namespace canônico e `kds` como naming/legado.
- [ADR-0007-salon-order-table-context-temporary.md](./ADR-0007-salon-order-table-context-temporary.md) - invariante temporaria para reduzir dupla fonte de verdade entre Order.tableId e Order.commandId ate TableSession.

## Limite de escopo

Este README nao substitui os ADRs.
Ele nao redefine comportamento.
Ele serve apenas como indice e guia rapido da documentacao de convergencia.

