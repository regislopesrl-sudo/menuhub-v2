# ADR 0007: Invariante temporaria de contexto mesa/comanda sem TableSession

Data: 2026-04-26

## Status

Aceito (temporario)

## Problema

No fluxo de salao, `Order` ainda possui `tableId` e `commandId` ao mesmo tempo.
Isso cria dupla fonte de verdade:

- parte do codigo trata `order.tableId` como fonte primaria de contexto fisico;
- outra parte usa `order.commandId` para contexto operacional/financeiro da comanda.

Com isso, era possivel gerar divergencia de contexto (pedido ligado a uma comanda, mas com `tableId` legado diferente), afetando transferencia, relatorios de salao e previsibilidade operacional.

## Decisao temporaria

Ate a entrada de `TableSession`, fica definida a invariante:

- quando `order.commandId` existir, o contexto de mesa deve ser derivado da `Command.tableRestaurantId`;
- `order.tableId` permanece apenas como compatibilidade legada, nao como fonte primaria;
- transferencias continuam auditadas; o uso de `CommandStatus.CANCELED` em transferencia entre comandas permanece workaround temporario e explicitamente auditavel.

Aplicacao pratica no backend:

- criacao de pedido resolve contexto por comanda antes de persistir `tableId`;
- `CommandsService.addItem` prioriza mesa da comanda;
- relatorios de salao resolvem mesa por `order.command.tableRestaurantId ?? order.tableId`.

## Trade-offs

- Pro:
  - reduz divergencia operacional sem migration destrutiva;
  - melhora previsibilidade de fluxo de salao na fase incremental;
  - prepara caminho para `TableSession` sem reescrita total.
- Contra:
  - modelo continua com campo legado redundante (`order.tableId`);
  - workaround com `CANCELED` em transferencia nao representa estado final ideal de dominio;
  - exige disciplina para nao reintroduzir leitura primaria de `order.tableId`.

## O que sera removido quando TableSession entrar

Quando `TableSession` for introduzido de forma estrutural:

1. remover a necessidade de `order.tableId` como compatibilidade operacional de salao;
2. substituir workaround de transferencia baseado em `CommandStatus.CANCELED` por fluxo formal de transferencia/reabertura com estado/evento dedicado;
3. mover correlacao fisica de ocupacao para `TableSession` (mesa fisica) e manter `Command` como documento operacional-financeiro;
4. eliminar leituras legadas que dependem de fallback `command.tableRestaurantId ?? order.tableId`;
5. consolidar trilha de auditoria de transferencia e reabertura em eventos de dominio especificos do salao.

## Referencias

- [apps/backend/src/orders/orders.service.ts](../../apps/backend/src/orders/orders.service.ts)
- [apps/backend/src/modules/commands/commands.service.ts](../../apps/backend/src/modules/commands/commands.service.ts)
- [apps/backend/src/modules/tables/tables.service.ts](../../apps/backend/src/modules/tables/tables.service.ts)
- [apps/backend/src/modules/reports/reports.service.ts](../../apps/backend/src/modules/reports/reports.service.ts)
- [apps/backend/src/orders/orders.table-context.spec.ts](../../apps/backend/src/orders/orders.table-context.spec.ts)
- [apps/backend/src/modules/commands/commands.service.spec.ts](../../apps/backend/src/modules/commands/commands.service.spec.ts)
- [apps/backend/src/modules/tables/tables.service.spec.ts](../../apps/backend/src/modules/tables/tables.service.spec.ts)
