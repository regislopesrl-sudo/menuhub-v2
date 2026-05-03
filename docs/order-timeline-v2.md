# Order Timeline V2

## Objetivo

Registrar historico operacional real dos pedidos V2 sem quebrar pedidos antigos que ainda nao possuem eventos historicos.

## Modelo atual

A V2 usa `OrderTimelineEvent` para eventos novos de pedido:

- criacao do pedido;
- mudanca de status;
- atualizacao de pagamento;
- sincronizacao de pagamento via webhook.

O endpoint `GET /v2/orders/:id` retorna:

```json
{
  "timelineSource": "events",
  "timeline": []
}
```

## Pedidos antigos

Pedidos criados antes da timeline real podem nao ter registros em `OrderTimelineEvent`.

Para estes pedidos, o backend mantem fallback por timestamps do proprio pedido:

- `createdAt`;
- `confirmedAt`;
- `preparationStartedAt`;
- `readyAt`;
- `dispatchedAt`;
- `deliveredAt`;
- `finalizedAt`;
- `canceledAt`.

Nestes casos, o endpoint retorna:

```json
{
  "timelineSource": "fallback",
  "timeline": []
}
```

O frontend deve exibir o aviso:

> Historico estimado com base nos timestamps existentes.

## Limite da timeline fallback

A timeline fallback e estimada. Ela nao possui todos os detalhes de ator, origem, payload, integracao ou webhook. Ela existe apenas para manter leitura operacional em pedidos legados.

## Faturamento no summary

O endpoint `GET /v2/orders/summary` retorna tres leituras financeiras:

- `grossRevenue`: soma de `totalAmount` de todos os pedidos filtrados.
- `netRevenue`: soma de pedidos nao cancelados/estornados, descontando `refundedAmount`.
- `canceledRevenue`: soma de `totalAmount` dos pedidos com status ou pagamento `CANCELED`/`REFUNDED`.

No painel `/admin/orders`, o KPI principal deve usar `netRevenue`. O valor bruto fica disponivel como detalhe de apoio.

## Backfill futuro

Nao ha backfill automatico nesta fase.

Uma estrategia futura segura seria criar um comando interno, por exemplo:

```bash
npm run orders:timeline:backfill --workspace @delivery-futuro/api-v2
```

Regras sugeridas para esse comando futuro:

- processar por `companyId` e `branchId`;
- criar eventos somente se o pedido nao tiver nenhum `OrderTimelineEvent`;
- preservar `createdAt` dos eventos estimados conforme timestamps existentes;
- marcar `payload.source = "backfill"`;
- rodar primeiro em dry-run;
- gerar relatorio de quantidade de pedidos processados e ignorados.

## Decisao atual

Eventos reais passam a valer para pedidos novos e atualizacoes novas. Pedidos antigos continuam legiveis via fallback e identificados explicitamente com `timelineSource = "fallback"`.
