# Fundacao tecnica do backend do Pastelzissimo

Base consolidada em 2026-04-14 a partir de:

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/main.ts`
- `apps/backend/src/common/http/request-context.ts`
- `apps/backend/src/common/interceptors/response-envelope.interceptor.ts`
- `apps/backend/src/common/filters/http-exception.filter.ts`
- `apps/backend/src/orders`
- `apps/backend/src/checkout`
- `apps/backend/src/payments`
- `apps/backend/src/realtime`
- controllers em `apps/backend/src/modules/*`

Decisoes de base observadas no codigo atual:

- o backend ja sobe com prefixo global `api` e versionamento URI, logo o contrato alvo oficial ja e `/api/v1`;
- o schema Prisma ja possui `Order`, `OrderItem`, `OrderPayment`, `OrderTimelineEvent`, `RealtimeOutboxEvent`, `RealtimeSocketSession`, `IdempotencyRequest`, `OrderPaymentRefund` e `UserBranchAccess`;
- ja existe `RequestContext` com `X-Request-Id`, `X-Branch-Id`, `X-Channel` e `Idempotency-Key`;
- ja existe envelope unico de resposta e filtro unico de erro;
- ainda existe duplicidade real entre `orders`, `checkout`, `orders-core`, `delivery`, `delivery-areas`, `financial`, `finance`, `inventory`, `stock`, `kds` e `kitchen`.
- `whatsapp` ja funciona como fluxo proprio de backend, com webhook, conversas e bot ligado a `menu` e `orders-core`; o runtime atual expõe `whatsapp/conversations/*` e nao monta `conversations/*`.

Objetivo desta fundacao: usar o que ja existe, fechar as ambiguidades e definir o caminho canonico para o backend evoluir em producao sem retrabalho.

## 1. Contrato da API

### 1.1 Prefixo, namespaces e ownership

Prefixo oficial:

- `/api/v1`

Namespaces oficiais:

- `/api/v1` para backoffice, operacao e integracoes autenticadas
- `/api/v1/public` para jornada anonima do Customer App
- `/api/v1/customer` para jornada autenticada do cliente
- `/api/v1/integrations` para integracao sistema-a-sistema
- `/api/v1/webhooks` para callbacks externos

Regra de naming:

- recursos em plural;
- nomes em kebab-case;
- REST para recurso;
- endpoint de acao para transicao de negocio com auditoria.

Exemplos canonicos:

- `GET /api/v1/orders`
- `POST /api/v1/orders`
- `POST /api/v1/orders/:id/status-transitions`
- `POST /api/v1/orders/:id/cancellations`
- `POST /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/refunds`

### 1.2 Request context oficial

Todo endpoint mutavel deve resolver internamente:

```ts
type RequestContext = {
  requestId: string;
  companyId?: string;
  branchId?: string;
  actorId?: string;
  actorType: 'USER' | 'CUSTOMER' | 'INTEGRATION' | 'SYSTEM';
  channel: 'ADMIN' | 'PDV' | 'WEB' | 'WHATSAPP' | 'KIOSK' | 'QR' | 'ERP' | 'MARKETPLACE' | 'CUSTOMER_APP' | 'INTEGRATION';
  idempotencyKey?: string;
  branchIds: string[];
  permissions: string[];
  roles: string[];
};
```

Ordem de precedencia:

1. JWT ou credencial de integracao
2. `X-Branch-Id`
3. parametros de rota que ja ancoram o escopo
4. query em leitura
5. body apenas para referencias de negocio, nunca para autenticacao

### 1.3 Headers padrao

Obrigatorios em operacoes criticas:

- `Authorization`
- `X-Request-Id`
- `X-Branch-Id`
- `X-Channel`
- `Idempotency-Key`

Opcional e recomendado:

- `If-Match` para concorrencia otimista quando `version` estiver disponivel

Uso por header:

- `X-Request-Id`: correlacao fim a fim entre HTTP, timeline, outbox e logs
- `X-Branch-Id`: resolucao de contexto multi-filial
- `X-Channel`: origem real do pedido e da operacao
- `Idempotency-Key`: replay seguro de criacao, pagamento, cancelamento, estorno e ajuste

### 1.4 Envelope unico de sucesso

O interceptor atual ja aponta para o contrato certo. O padrao oficial fica:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-14T12:00:00.000Z",
    "version": "v1"
  }
}
```

Para listagem:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-14T12:00:00.000Z",
    "version": "v1",
    "pagination": {
      "page": 1,
      "perPage": 20,
      "totalItems": 140,
      "totalPages": 7,
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "filters": {
      "status": ["CONFIRMED", "READY"],
      "branchId": "uuid"
    },
    "sort": [
      { "field": "createdAt", "direction": "desc" }
    ]
  }
}
```

### 1.5 Envelope unico de erro

O filtro global atual ja esta proximo do contrato alvo. O padrao oficial e:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_STATUS_TRANSITION_INVALID",
    "message": "O pedido nao pode ser alterado para o status informado.",
    "category": "business",
    "origin": "POST /api/v1/orders/:id/status-transitions",
    "details": {
      "currentStatus": "READY",
      "requestedStatus": "CONFIRMED",
      "allowedTransitions": ["WAITING_DISPATCH", "FINALIZED"]
    },
    "traceId": "uuid"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-14T12:00:00.000Z",
    "version": "v1"
  }
}
```

Categorias oficiais:

- `validation`
- `auth`
- `authorization`
- `business`
- `infrastructure`

### 1.6 Paginacao, filtros e ordenacao

Contrato base para `GET /resource`:

- `page`
- `perPage`
- `sort`
- `search`
- `from`
- `to`
- `status`
- `branchId`
- `channel`

Padrao:

```http
GET /api/v1/orders?page=1&perPage=20&sort=createdAt:desc&status=CONFIRMED,READY&branchId=<uuid>&from=2026-04-01&to=2026-04-14&search=12345
```

Regras:

- `page` default `1`
- `perPage` default `20`, maximo `100`
- `sort` com whitelist por endpoint
- `status` e `channel` como CSV que vira array tipada
- `from <= to`

### 1.7 Como o contrato atende cada consumidor

Customer App:

- consome `public/menu`, `public/orders`, `customer/auth` e `customer/orders`;
- usa erros amigaveis, idempotencia e rastreio por `requestId`.

Painel administrativo:

- opera em `/api/v1`;
- usa filtros, paginacao e realtime por filial.

Cozinha:

- consome `kitchen/*` e eventos `kds.*`/`order.*`;
- nao precisa conhecer pagamento em detalhe, apenas liberacao operacional.

Financeiro:

- consome `finance/*`, `orders/:id/payments`, `orders/:id/refunds`;
- usa status financeiros agregados do pedido e detalhes de transacao.

Integracoes futuras:

- recebem contrato estavel, plural, versionado e idempotente;
- usam `integrations/*` e `webhooks/*` sem depender de rotas legadas.

## 2. Fluxos criticos do pedido

### 2.1 Agregado central

O agregado central continua sendo `Order`.

O que pertence ao agregado:

- contexto do pedido;
- itens e adicionais;
- totais;
- status operacional;
- resumo financeiro (`paymentStatus`, `paidAmount`, `refundedAmount`);
- timeline;
- relacao com cozinha, delivery, financeiro e estoque por eventos e casos de uso.

### 2.2 Criacao do pedido

Fluxo oficial:

1. Resolver `RequestContext`.
2. Validar `companyId` e `branchId`.
3. Validar `customer`, `table`, `command` ou `delivery`, conforme `orderType`.
4. Carregar produtos, addons, combos e precos do servidor.
5. Validar disponibilidade por canal e filial.
6. Montar snapshots de item.
7. Calcular totais com `Prisma.Decimal`.
8. Persistir em uma unica transacao:
   - `Order`
   - `OrderItem`
   - `OrderItemAddon`
   - timeline inicial
   - idempotencia
   - outbox realtime
9. Se houver pagamento inline, registrar tentativa, mas so confirmar pedido quando a politica permitir.

Estado inicial:

- `DRAFT` para edicao controlada
- `PENDING_CONFIRMATION` para checkout que ainda depende de validacao/pagamento
- `CONFIRMED` quando o pedido ja esta liberado operacionalmente

### 2.3 Inclusao, edicao e remocao de itens

Regra:

- item so pode ser alterado em `DRAFT` ou `PENDING_CONFIRMATION`;
- alteracao apos `CONFIRMED` exige acao explicita e politica da operacao;
- o cliente nunca define preco autoritativo;
- `addons` enviados substituem a composicao atual daquele item.

Operacoes canonicas:

- `POST /orders/:id/items`
- `PATCH /orders/:id/items/:itemId`
- `DELETE /orders/:id/items/:itemId` ou `POST /orders/:id/items/:itemId/cancellations`

### 2.4 Adicionais, variacoes e combos

Adicionais:

- validar vinculo com o produto;
- respeitar `minSelect`, `maxSelect` e regras do grupo;
- persistir `nameSnapshot` e `priceSnapshot`.

Variacoes:

- enquanto nao existir `ProductVariant`, tratar como produto dedicado ou payload com `variationCode` validado por catalogo;
- se variacao for requisito de negocio real, evoluir schema para `ProductVariant`.

Combos:

- precificacao acontece no pedido;
- desdobramento operacional deve gerar composicao de itens para KDS e estoque;
- nao usar combinacao ad hoc no frontend como fonte de verdade.

### 2.5 Calculo de totais

Ordem oficial:

1. preco base do item
2. variacoes e adicionais
3. subtotal da linha
4. descontos de item
5. subtotal do pedido
6. desconto de cupom/manual
7. taxas de servico/embalagem/extra
8. frete
9. total final

Formula:

```text
lineTotal = (basePrice + variationDelta + addonsDelta) * quantity - lineDiscount + lineExtra
subtotal = soma(lineTotal)
totalAmount = subtotal - discountAmount + extraFee + deliveryFee
```

Regra:

- recalcular o pedido inteiro a cada mutacao;
- nunca confiar em `subtotal` e `totalAmount` do cliente;
- usar apenas `Prisma.Decimal`.

### 2.6 Confirmacao de pagamento

Fluxo oficial:

1. receber `Idempotency-Key`;
2. travar o pedido e/ou usar concorrencia otimista;
3. validar metodo, valor e saldo pendente;
4. criar ou atualizar `OrderPayment`;
5. atualizar agregado:
   - `paidAmount`
   - `refundedAmount`
   - `paymentStatus`
6. registrar timeline;
7. publicar `order.paid` ou `payment.failed`;
8. se o pedido ficou pago ou operacionalmente liberado, transicionar para `CONFIRMED`.

Resumo financeiro oficial do pedido:

- `UNPAID`
- `PENDING`
- `PARTIALLY_PAID`
- `PAID`
- `PARTIALLY_REFUNDED`
- `REFUNDED`
- `CANCELED`

### 2.7 Envio para cozinha

Gatilho oficial:

- pedido `CONFIRMED` e liberado pela politica do canal/filial;
- ou liberacao manual auditada.

Fluxo:

1. agrupar itens por `station`;
2. marcar despacho do item;
3. registrar timeline;
4. gerar `kds.order_created` ou `kds.order_updated`;
5. quando o KDS avancar item/pedido, refletir no agregado `Order`/`OrderItem`.

Estados de item:

- `PENDING`
- `IN_PROGRESS`
- `DONE`
- `CANCELED`

### 2.8 Atualizacao de status do pedido

Transicoes validas:

- `DRAFT -> PENDING_CONFIRMATION | CONFIRMED | CANCELED`
- `PENDING_CONFIRMATION -> CONFIRMED | CANCELED`
- `CONFIRMED -> IN_PREPARATION | CANCELED`
- `IN_PREPARATION -> READY | CANCELED`
- `READY -> WAITING_PICKUP | WAITING_DISPATCH | FINALIZED`
- `WAITING_PICKUP -> FINALIZED`
- `WAITING_DISPATCH -> OUT_FOR_DELIVERY`
- `OUT_FOR_DELIVERY -> DELIVERED`
- `DELIVERED -> FINALIZED | REFUNDED`
- `CANCELED -> REFUNDED` quando houver estorno total

Regras:

- `pago` nao vira `OrderStatus`; continua sendo estado financeiro;
- `enviado para cozinha` nao vira `OrderStatus`; continua sendo evento/timeline;
- `PATCH` cego de status deve ser evitado; usar rota de acao.

### 2.9 Cancelamento

Fluxo oficial:

1. validar se o status permite cancelamento;
2. exigir `reasonCode` e, quando necessario, `reasonText`;
3. registrar actor, canal, data e motivo;
4. atualizar pedido para `CANCELED`;
5. cancelar despacho de cozinha ou marcar compensacao;
6. iniciar fluxo financeiro:
   - void
   - refund parcial
   - refund total
7. ajustar estoque:
   - liberar reserva
   - retornar saldo
   - registrar perda
8. publicar `order.cancelled`.

### 2.10 Estorno

Fluxo oficial:

1. receber `paymentId`, `amount`, `reasonCode`;
2. validar saldo estornavel;
3. criar `OrderPaymentRefund`;
4. atualizar `OrderPayment.refundedAmount` e status;
5. atualizar `Order.refundedAmount` e `paymentStatus`;
6. registrar timeline e evento realtime;
7. refletir no financeiro.

### 2.11 Timeline completa

Eventos minimos:

- `ORDER_CREATED`
- `ORDER_REPRICED`
- `ORDER_ITEM_ADDED`
- `ORDER_ITEM_UPDATED`
- `ORDER_ITEM_CANCELED`
- `ORDER_STATUS_CHANGED`
- `PAYMENT_INITIATED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_DECLINED`
- `PAYMENT_REFUND_REQUESTED`
- `PAYMENT_REFUND_COMPLETED`
- `KITCHEN_DISPATCHED`
- `KITCHEN_STARTED`
- `KITCHEN_READY`
- `DELIVERY_ASSIGNED`
- `DELIVERY_DISPATCHED`
- `ORDER_DELIVERED`
- `ORDER_FINALIZED`
- `ORDER_CANCELED`
- `STOCK_MOVEMENT_CREATED`
- `FINANCIAL_ENTRY_CREATED`

### 2.12 Reprocessamento e falhas

Padrao oficial:

- persistir o pedido antes dos efeitos colaterais;
- enviar efeitos por outbox;
- consumidores idempotentes;
- falha de realtime nunca reverte a transacao do pedido;
- falha de KDS, estoque ou financeiro gera retry e alerta.

Impacto por dominio:

- estoque: reservar/liberar/baixar/compensar
- financeiro: abrir/baixar/estornar recebivel e caixa
- delivery: criar atribuicao e despacho
- cozinha: consumir eventos e refletir preparo

## 3. Motor realtime/WebSocket

### 3.1 Base atual valida

O backend ja possui:

- `OrdersGateway`
- autenticacao de socket com JWT admin ou customer
- autorizacao por escopo
- salas por pedido, filial, usuario, cliente, sessao, KDS, financeiro e alertas
- outbox persistente
- dispatcher com retry
- replay por `lastAckedEventId`
- persistencia de sessao em `RealtimeSocketSession`
- persistencia de entrega/ack em `RealtimeEventDelivery`

Essa base deve ser mantida. O que precisa ser fechado e o contrato canonico do evento.

### 3.2 Fluxo oficial

Pipeline oficial:

```text
HTTP request
-> use case
-> transacao Prisma
-> OrderTimelineEvent + RealtimeOutboxEvent
-> commit
-> RealtimeDispatcherService
-> RealtimeBroadcastService
-> Socket rooms
-> ack/replay/presence
```

Regra:

- HTTP nunca faz broadcast direto como fonte primaria;
- broadcast sai do outbox;
- o `Dispatcher` pode publicar imediatamente apos commit, mas a confiabilidade esta no outbox, nao no socket.

### 3.3 Autenticacao do socket

Fonte de token:

- `handshake.auth.token`
- `handshake.auth.accessToken`
- header `Authorization: Bearer`
- `query.token` apenas como compatibilidade

Principal realtime:

- `USER`
- `CUSTOMER`

Claims relevantes:

- `sub`
- `companyId`
- `branchIds`
- `roles`
- `permissions`

### 3.4 Salas oficiais

Salas canonicas:

- `branch_<branchId>`
- `order_<orderId>`
- `user_<userId>`
- `customer_<customerId>`
- `session_<sessionId>`
- `kds_branch_<branchId>`
- `kds_station_<branchId>_<station>`
- `finance_<branchId>`
- `alerts_<branchId>`

Regra:

- qualquer broadcast deve carregar `roomHints`;
- o gateway pode inferir rooms basicas por `branchId`, `orderId` e `userId`.

### 3.5 Catalogo oficial de eventos

Eventos canonicos:

- `order.created`
- `order.updated`
- `order.status_changed`
- `order.paid`
- `order.cancelled`
- `checkout.created`
- `checkout.paid`
- `kds.order_created`
- `kds.order_updated`
- `stock.movement.created`
- `alert.created`
- `payment.failed`

Compatibilidade:

- manter aliases `order.canceled`, `order.status.changed` e `order_status_changed` apenas durante migracao;
- `order.cancelled` e a forma canonica nova;
- `kds.*` pode continuar coexistindo com `kitchen.*` no backend, mas o contrato publico do REST deve usar `kitchen`.

### 3.6 Envelope oficial do evento

```json
{
  "eventId": "uuid",
  "type": "order.status_changed",
  "timestamp": "2026-04-14T12:00:00.000Z",
  "traceId": "uuid",
  "branchId": "uuid",
  "orderId": "uuid",
  "userId": "uuid",
  "origin": "orders",
  "payload": {
    "orderId": "uuid",
    "previousStatus": "CONFIRMED",
    "newStatus": "IN_PREPARATION",
    "updatedAt": "2026-04-14T12:00:00.000Z"
  },
  "metadata": {
    "schemaVersion": "v1",
    "aggregate": "order",
    "aggregateVersion": 12,
    "roomHints": ["branch_<branchId>", "order_<orderId>"],
    "requiresAck": true,
    "dedupeKey": "order.status_changed:order:<orderId>:12",
    "replayable": true
  }
}
```

### 3.7 Broadcast confiavel, reconexao e fallback

Confiabilidade:

- `RealtimeOutboxEvent.status` governa o ciclo `PENDING -> PROCESSING -> PUBLISHED | FAILED`;
- retry exponencial no dispatcher;
- `RealtimeEventDelivery` grava entrega por sessao/room;
- cliente pode enviar `realtime.ack` e `realtime.resume`.

Reconexao:

- cliente informa `lastEventId`;
- backend usa replay filtrado por rooms autorizadas e filiais permitidas.

Fallback:

- se o socket falhar, frontend continua com polling/refresh HTTP;
- erro de broadcast nao invalida a transacao do pedido;
- storage indisponivel entra em fallback logado, sem derrubar o request.

### 3.8 Observabilidade

Obrigatorio medir:

- eventos publicados por tipo
- backlog do outbox
- tentativas e falhas
- tempo entre commit e broadcast
- sessoes conectadas por filial
- eventos sem ack
- replay count

Correlacao:

- `traceId` do evento deve bater com `X-Request-Id` do request original

## 4. Rotas canonicas e convencoes por modulo

### 4.1 Regras gerais

REST puro quando:

- cria/lista/detalha/edita o recurso

Rota de acao quando:

- ha transicao de status
- ha efeito colateral em outros dominios
- ha motivo e auditoria
- ha idempotencia obrigatoria

Padroes:

- `GET /resource`
- `GET /resource/:id`
- `POST /resource`
- `PATCH /resource/:id`
- `POST /resource/:id/<business-action>`

### 4.2 Rotas oficiais por dominio

Auth:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/customer/auth/request-otp`
- `POST /api/v1/customer/auth/verify-otp`
- `GET /api/v1/customer/auth/me`

Users e RBAC:

- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `GET /api/v1/roles`
- `GET /api/v1/roles/:id`
- `POST /api/v1/roles`
- `PATCH /api/v1/roles/:id`
- `GET /api/v1/permissions`

Customers:

- `GET /api/v1/customers`
- `GET /api/v1/customers/:id`
- `POST /api/v1/customers`
- `PATCH /api/v1/customers/:id`
- `GET /api/v1/customers/:id/addresses`
- `POST /api/v1/customers/:id/addresses`
- `PATCH /api/v1/customers/:id/addresses/:addressId`

Menu:

- `GET /api/v1/menu/categories`
- `GET /api/v1/menu/products`
- `GET /api/v1/menu/products/:id`
- `POST /api/v1/menu/products`
- `PATCH /api/v1/menu/products/:id`
- `GET /api/v1/menu/addon-groups`
- `GET /api/v1/menu/combos`

Orders:

- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders`
- `PATCH /api/v1/orders/:id`
- `GET /api/v1/orders/:id/timeline`
- `POST /api/v1/orders/:id/items`
- `PATCH /api/v1/orders/:id/items/:itemId`
- `POST /api/v1/orders/:id/status-transitions`
- `POST /api/v1/orders/:id/cancellations`
- `GET /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/refunds`

Checkout publico:

- `GET /api/v1/public/menu`
- `POST /api/v1/public/orders/quote`
- `POST /api/v1/public/orders`
- `GET /api/v1/public/orders/:id`
- `POST /api/v1/public/orders/:id/payment-intents`

Customer orders:

- `GET /api/v1/customer/orders`
- `GET /api/v1/customer/orders/:id`
- `POST /api/v1/customer/orders`
- `POST /api/v1/customer/orders/:id/cancellations`

Payments:

- `GET /api/v1/payments`
- `GET /api/v1/payments/:id`
- `POST /api/v1/payments/confirmations`
- `POST /api/v1/payments/refunds`
- `POST /api/v1/payments/reconciliations`
- `POST /api/v1/webhooks/payments/:provider`

Kitchen:

- `GET /api/v1/kitchen/orders`
- `GET /api/v1/kitchen/orders/:id`
- `GET /api/v1/kitchen/stations/:station/orders`
- `POST /api/v1/kitchen/orders/:id/send`
- `POST /api/v1/kitchen/orders/:id/start`
- `POST /api/v1/kitchen/orders/:id/mark-ready`
- `POST /api/v1/kitchen/orders/:id/finish`

Delivery:

- `GET /api/v1/delivery/areas`
- `GET /api/v1/delivery/areas/:id`
- `POST /api/v1/delivery/areas`
- `PATCH /api/v1/delivery/areas/:id`
- `GET /api/v1/delivery/couriers`
- `POST /api/v1/delivery/couriers`
- `PATCH /api/v1/delivery/couriers/:id`
- `GET /api/v1/delivery/deliveries`
- `POST /api/v1/delivery/deliveries`
- `POST /api/v1/delivery/deliveries/:id/dispatch`
- `POST /api/v1/delivery/deliveries/:id/complete`
- `GET /api/v1/public/delivery/coverage`

Stock:

- `GET /api/v1/stock/items`
- `GET /api/v1/stock/items/:id`
- `POST /api/v1/stock/items`
- `PATCH /api/v1/stock/items/:id`
- `GET /api/v1/stock/batches`
- `POST /api/v1/stock/batches`
- `GET /api/v1/stock/movements`
- `POST /api/v1/stock/adjustments`
- `POST /api/v1/stock/waste`
- `GET /api/v1/stock/purchase-orders`
- `POST /api/v1/stock/purchase-orders`
- `GET /api/v1/stock/goods-receipts`
- `POST /api/v1/stock/goods-receipts`
- `GET /api/v1/recipes`

Production:

- `GET /api/v1/production/orders`
- `POST /api/v1/production/orders`
- `POST /api/v1/production/orders/:id/start`
- `POST /api/v1/production/orders/:id/finish`
- `POST /api/v1/production/orders/:id/cancel`

Finance:

- `GET /api/v1/finance/cash-registers`
- `POST /api/v1/finance/cash-registers`
- `POST /api/v1/finance/cash-registers/:id/close`
- `GET /api/v1/finance/accounts-payable`
- `POST /api/v1/finance/accounts-payable`
- `GET /api/v1/finance/accounts-receivable`
- `POST /api/v1/finance/accounts-receivable`
- `GET /api/v1/finance/dashboard`

Tables e Commands:

- `GET /api/v1/tables`
- `GET /api/v1/tables/:id`
- `POST /api/v1/tables`
- `PATCH /api/v1/tables/:id`
- `GET /api/v1/commands`
- `GET /api/v1/commands/:id`
- `POST /api/v1/tables/:id/commands`
- `POST /api/v1/commands/:id/items`
- `POST /api/v1/commands/:id/close`
- `POST /api/v1/commands/:id/transfers`
- `GET /api/v1/counter-orders`
- `POST /api/v1/counter-orders`

### 4.3 Compatibilidade com rotas atuais

Manter como canonicas agora:

- `orders`
- `customer/orders`
- `public/orders`
- `payments`
- `finance`
- `kitchen`
- `stock`
- `customers`
- `commands`
- `auth`

Manter apenas como alias de migracao:

- `checkout`
- `sales`
- `delivery-areas`
- `financial`
- `inventory`
- `kds`
- controllers com `@Controller()` vazio que montam paths flat

### 4.4 Conflitos principais e decisao canonica

`orders` vs `checkout`:

- `orders` e o agregado central;
- `checkout` vira fachada publica ou alias temporario;
- novas integracoes nao devem nascer em `/checkout`.

`orders` vs `sales`:

- `sales` deve desaparecer do contrato publico;
- venda vira pedido interno (`orders`) ou conta/balcao (`counter-orders`).

`delivery` vs `delivery-areas`:

- tudo deve convergir para `/delivery/areas`;
- `delivery-areas` vira alias legado.

`payments` vs `orders/:id/payments`:

- `orders/:id/payments` continua sendo sub-recurso do pedido;
- `payments/*` fica com confirmacao, refund, reconciliacao e webhook.

`kitchen` vs `kds`:

- `kitchen` e o nome de negocio do REST;
- `kds` pode seguir nos eventos e na implementacao interna.

`stock` vs `inventory`:

- `stock` e o namespace oficial;
- `inventory` vira alias tecnico.

`finance` vs `financial`:

- `finance` e o namespace oficial;
- `financial` vira alias legado.

### 4.5 O que evitar

Evitar:

- `PATCH /orders/:id/status` como rota publica de longa duracao
- `POST /orders/:id/cancel`
- `POST /orders/:id/refund`
- `POST /checkout/orders`
- `POST /sales`
- `GET /inventory/*`
- `GET /financial/*`

Preferir:

- `POST /orders/:id/status-transitions`
- `POST /orders/:id/cancellations`
- `POST /orders/:id/refunds`

## 5. Padrao de DTOs, validacoes e contratos de entrada

### 5.1 Estrutura oficial

Padrao por modulo:

```text
src/modules/<domain>/
  interface/http/
    controllers/
    dto/
      requests/
      queries/
  application/
    use-cases/
    ports/
  domain/
    entities/
    policies/
    events/
    value-objects/
  infrastructure/
    prisma/
    realtime/
    mappers/
```

DTOs compartilhados em `src/common/dto`:

- `PaginationQueryDto`
- `DateRangeQueryDto`
- `BranchScopedQueryDto`
- `BaseListQueryDto`
- `IdempotentActionHeadersDto`

### 5.2 Taxonomia oficial

- `Create*RequestDto`
- `Update*RequestDto`
- `List*QueryDto`
- `*FiltersDto`
- `*ActionRequestDto`
- `*InputDto` para objetos aninhados

Regra:

- nao reutilizar `CreateDto` para `UpdateDto` automaticamente;
- nao usar DTO de CRUD para cancelamento, estorno, fechamento, despacho ou acao de negocio.

### 5.3 Validacoes obrigatorias

Aplicar sempre:

- `@IsUUID`
- `@IsEnum`
- `@IsString`
- `@Min` e `@Max`
- `@ArrayMinSize`
- `@ValidateNested`
- `@IsISO8601`
- normalizacao de string vazia para `undefined`
- monetarios com 2 casas
- quantidades com 3 casas

Validacoes condicionais:

- `orderType = DELIVERY` exige `delivery`
- `orderType = TABLE` exige `tableId`
- `orderType = COMMAND` exige `commandId`
- `reasonCode = OTHER` exige `reasonText`
- `payment.method in [PIX, CARD, EXTERNAL]` exige referencia externa quando a confirmacao for manual/integrada
- item com lote controlado exige `batchId` ou selecao automatica

### 5.4 Idempotencia

Obrigatoria em:

- criacao de pedido
- confirmacao de pagamento
- cancelamento
- estorno
- ajuste de estoque

Contrato:

- `Idempotency-Key` vem em header;
- `IdempotencyRequest` continua sendo o store oficial;
- `scope + key` continua unico;
- `fingerprint` deve validar reuso com payload diferente.

### 5.5 Contratos de entrada oficiais

Pedido:

```ts
class CreateOrderRequestDto {
  orderType: OrderType;
  customerId?: string;
  couponCode?: string;
  notes?: string;
  internalNotes?: string;
  tableId?: string;
  commandId?: string;
  items: OrderItemInputDto[];
  delivery?: OrderDeliveryInputDto;
  initialPayments?: CreateOrderPaymentRequestDto[];
}
```

Item do pedido:

```ts
class OrderItemInputDto {
  productId: string;
  quantity: number;
  notes?: string;
  addons?: OrderItemAddonInputDto[];
  variationCode?: string;
  comboId?: string;
}
```

Pagamento:

```ts
class CreateOrderPaymentRequestDto {
  method: OrderPaymentMethod;
  amount: number;
  provider?: string;
  transactionReference?: string;
  providerTransactionId?: string;
  metadata?: Record<string, unknown>;
}
```

Cancelamento:

```ts
class CancelOrderRequestDto {
  reasonCode: string;
  reasonText?: string;
}
```

Estorno:

```ts
class CreatePaymentRefundRequestDto {
  paymentId: string;
  amount: number;
  reasonCode: string;
  reasonText?: string;
  externalReference?: string;
  metadata?: Record<string, unknown>;
}
```

Movimentacao de estoque:

```ts
class CreateStockMovementRequestDto {
  stockItemId: string;
  movementType: StockMovementType;
  quantity: number;
  batchId?: string;
  unitCost?: number;
  reasonCode?: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}
```

Cliente:

```ts
class CreateCustomerRequestDto {
  name: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  cpfCnpj?: string;
  birthDate?: string;
  notes?: string;
  isVip?: boolean;
  addresses?: CustomerAddressInputDto[];
}
```

Mesa/comanda:

```ts
class CreateTableRequestDto {
  name: string;
  capacity?: number;
  qrCode?: string;
}

class OpenCommandRequestDto {
  tableId?: string;
  customerId?: string;
  code?: string;
}
```

Login e refresh:

```ts
class LoginRequestDto {
  email: string;
  password: string;
  branchId?: string;
}

class RefreshTokenRequestDto {
  refreshToken: string;
}
```

### 5.6 Regras de entrada por dominio

Pedido:

- `items` obrigatorio e nao vazio
- produto ativo e disponivel para o canal
- total sempre calculado no servidor

Pagamento:

- valor positivo
- pedido nao cancelado
- saldo pendente valido

Cancelamento:

- motivo obrigatorio
- status precisa permitir cancelamento

Estoque:

- item valido
- lote obrigatorio quando necessario
- sem saldo negativo quando nao permitido

Cliente:

- nome minimo
- pelo menos um canal de contato em contexto operacional

Mesa/comanda:

- pertencimento a filial
- mesa nao bloqueada
- comanda aberta para receber pedido

## 6. Estrutura modular e dependencias internas

### 6.1 Modulos canonicos

Modulos de negocio:

- `auth`
- `users`
- `customers`
- `menu`
- `orders`
- `payments`
- `kitchen`
- `delivery`
- `fiscal`
- `stock`
- `finance`
- `tables`
- `reports`
- `settings`

Modulos de suporte:

- `common`
- `database`
- `realtime`
- `integrations`

### 6.2 Papel de cada camada

Interface:

- controllers HTTP
- gateways WS
- DTOs
- mapeamento request/response

Application:

- use cases
- orquestracao transacional
- ports para outros modulos e infra

Domain:

- entidades
- value objects
- policies
- state machine
- domain events

Infrastructure:

- Prisma repositories
- adaptadores de pagamento
- outbox
- cache
- sockets

### 6.3 Dependencias permitidas

Permitidas:

- `interface -> application`
- `application -> domain`
- `application -> ports`
- `infrastructure -> domain/application`

Permitidas por negocio:

- `orders` pode ler `menu`, `customers`, `tables`, `delivery`
- `payments` pode ler `orders` e gravar `OrderPayment`
- `kitchen` pode ler `orders` e atualizar preparo via use case do dominio de pedido
- `delivery` pode ler `orders` e gravar atribuicao/entrega
- `stock` e `finance` reagem a eventos ou a use cases explicitos

### 6.4 Dependencias proibidas

Proibidas:

- controller falando com Prisma direto
- `kitchen` alterando `Order.status` por acesso direto ao banco
- `delivery` criando pedido
- `stock` baixando caixa
- `finance` alterando item de pedido
- `checkout` implementando regra de negocio propria paralela a `orders`

### 6.5 Servicos compartilhados oficiais

- `RequestContextResolver`
- `IdempotencyService`
- `AuditTrailService`
- `MoneyService`
- `PaginationFactory`
- `PermissionService`
- `OutboxPublisher`
- `RealtimePublisher`
- `DomainClock`

### 6.6 Use cases principais do nucleo

Orders:

- `CreateOrder`
- `AddOrderItem`
- `UpdateOrderItem`
- `RepriceOrder`
- `TransitionOrderStatus`
- `CancelOrder`
- `ConfirmOrderOperationally`
- `FinalizeOrder`

Payments:

- `CreatePaymentIntent`
- `ConfirmPayment`
- `CreateRefund`
- `ReconcilePayment`

Kitchen:

- `DispatchOrderToKitchen`
- `StartKitchenOrder`
- `MarkKitchenOrderReady`
- `FinishKitchenOrder`

Delivery:

- `AssignCourier`
- `DispatchDelivery`
- `CompleteDelivery`

Stock:

- `ReserveOrderStock`
- `ConsumeOrderStock`
- `ReleaseOrderStock`
- `AdjustStock`

Finance:

- `OpenReceivableForOrder`
- `SettleReceivable`
- `CreateCashMovement`
- `ReverseFinancialEntry`

### 6.7 Domain events oficiais

- `OrderCreatedEvent`
- `OrderRepricedEvent`
- `OrderStatusChangedEvent`
- `OrderCancelledEvent`
- `PaymentConfirmedEvent`
- `PaymentRefundedEvent`
- `KitchenOrderDispatchedEvent`
- `KitchenOrderReadyEvent`
- `StockMovementCreatedEvent`
- `ReceivableCreatedEvent`

### 6.8 Guard rails de arquitetura

Para reduzir acoplamento:

- `checkout` vira adaptador de interface, nao modulo de dominio separado;
- `orders-core` vira adaptador/alias de leitura publica, nao uma segunda fonte de regra;
- `kds` vira camada interna da `kitchen`;
- `financial` vira alias do `finance`;
- `inventory` vira alias do `stock`.

## 7. Seguranca e RBAC

### 7.1 Base atual correta

O projeto ja tem:

- JWT access token
- refresh token persistido
- `UserBranchAccess`
- `PermissionGuard`
- separacao entre usuario interno e customer
- `RequestContext` com `actorType`

Essa base deve ser mantida.

### 7.2 Claims oficiais do token interno

```ts
type AccessTokenClaims = {
  sub: string;
  email?: string | null;
  roles: string[];
  permissions: string[];
  companyId: string | null;
  branchId?: string | null;
  defaultBranchId?: string | null;
  branchIds: string[];
  actorType: 'USER';
};
```

Customer token:

```ts
type CustomerTokenClaims = {
  sub: string;
  companyId: string;
  branchIds?: string[];
  actorType: 'CUSTOMER';
};
```

### 7.3 Guard chain oficial

Ordem recomendada:

1. `JwtAuthGuard` ou `JwtCustomerGuard`
2. `CompanyScopeGuard`
3. `BranchScopeGuard`
4. `PermissionGuard`
5. `IdempotencyGuard` ou policy de acao critica

Regras:

- `companyId` do recurso precisa bater com o token
- `branchId` do recurso precisa estar dentro de `branchIds`
- permissao valida por codigo, nao apenas por role

### 7.4 Roles, permissions e escopo

Roles sao agrupadores:

- `SUPER_ADMIN`
- `ADMIN`
- `MANAGER`
- `CASHIER`
- `KITCHEN`
- `DELIVERY`
- `FINANCE`

Permissions sao unidade tecnica:

- `orders.view`
- `orders.create`
- `orders.cancel`
- `orders.transition`
- `payments.confirm`
- `payments.refund`
- `kitchen.view`
- `kitchen.operate`
- `stock.adjust`
- `finance.close_cash_register`
- `delivery.assign`

### 7.5 Refresh token, logout e sessao

Politica oficial:

- refresh token com rotacao
- logout revoga o refresh atual
- troca de senha ou inativacao revoga todas as sessoes
- sessao deve guardar `ipAddress`, `userAgent`, `lastUsedAt`

Estado atual:

- `RefreshToken` ja existe
- falta enriquecer com metadados de sessao ou criar `UserSession`

### 7.6 Protecao de rotas sensiveis

Sensivel sempre:

- cancelamento
- estorno
- fechamento de caixa
- ajuste de estoque
- atribuicao de entregador
- mudanca de configuracao
- alteracao de permissao

Essas rotas devem exigir:

- `X-Request-Id`
- contexto de filial
- permissao dedicada
- timeline e auditoria

### 7.7 Rastreabilidade

Toda acao critica deve registrar:

- `requestId`
- `actorId`
- `actorType`
- `branchId`
- `channel`
- `reasonCode`
- `reasonText`
- `before/after`

Persistencia oficial:

- `OrderTimelineEvent`
- `OrderStatusLog`
- `RealtimeOutboxEvent`
- futuro `UserSession` e auditoria transversal para financeiro/estoque

## 8. Ajustes recomendados no schema Prisma

### 8.1 O schema atual ja cobre bem

Ja esta alinhado e nao precisa ser reinventado:

- `Channel`
- `OrderStatus`
- `OrderPaymentMethod`
- `OrderPaymentStatus`
- `OrderPaymentSummaryStatus`
- `OrderItemStatus`
- `UserBranchAccess`
- `IdempotencyRequest`
- `OrderPaymentRefund`
- `OrderTimelineEvent`
- `RealtimeOutboxEvent`
- `RealtimeSocketSession`
- `RealtimeEventDelivery`
- `StockLocationBalance`

Ou seja: a base estrutural mais importante ja esta no schema atual.

### 8.2 Ajustes realmente necessarios

1. Adicionar concorrencia otimista

Adicionar `version Int @default(1)` em:

- `Order`
- `Command`
- `CounterOrder`
- `StockItem`
- `CashRegister`

2. Fechar lacunas do pedido para producao

Adicionar em `Order` apenas se o fluxo realmente precisar:

- `couponId`
- `couponCodeSnapshot`
- `serviceFeeAmount`
- `packagingFeeAmount`
- `taxAmount`
- `externalReference`
- `sourceSystem`
- `metadata`

3. Evoluir `OrderItem` para combo, variacao e cancelamento parcial

Adicionar:

- `parentItemId`
- `itemType`
- `comboId`
- `productVariantId`
- `discountAmount`
- `extraFeeAmount`
- `canceledQuantity`
- `cancellationReasonCode`
- `cancellationReasonText`
- `kdsDispatchStatus`

4. Convergir entrega para um unico agregado operacional

Hoje coexistem:

- `Order.driverId -> DeliveryDriver`
- `Courier`
- `CourierDelivery`

Decisao recomendada:

- manter `Courier`/`CourierDelivery` como modelo canonico de entrega;
- migrar tracking operacional do `DeliveryDriver` para `Courier` ou transformar `DeliveryDriver` em legado de compatibilidade;
- evitar dois conceitos diferentes de entregador no dominio.

5. Enriquecer sessao de autenticacao

Opcoes validas:

- adicionar metadados em `RefreshToken`
- ou criar `UserSession`

Campos minimos:

- `sessionId`
- `userAgent`
- `ipAddress`
- `lastUsedAt`
- `revokedReason`

6. Corrigir lacunas de relacao em compras e financeiro

Ainda precisam de relacoes Prisma explicitas e enums em alguns pontos:

- `Supplier -> Company`
- `PurchaseOrder -> Branch`
- `GoodsReceipt -> Branch` se o recebimento for filial-scoped
- `AccountsPayable -> PurchaseOrder`
- `CashMovement -> CashRegister`
- `CashMovement -> Order`
- `PurchaseOrder.status` como enum
- `GoodsReceipt.status` como enum

7. Firmar a fonte de verdade de estoque por filial

O schema ja possui `StockLocationBalance`.

Decisao recomendada:

- `StockLocationBalance` vira saldo operacional canonico por filial;
- `StockItem.currentQuantity` fica como agregado global derivado ou passa a ser deprecated;
- lotes e batches devem sempre carregar escopo de filial/local quando isso impactar operacao.

8. Auditoria em entidades financeiras e operacionais

Adicionar onde faltar:

- `createdById`
- `updatedById`
- `closedById`
- `approvedById`

Principalmente em:

- `CashRegister`
- `CashMovement`
- `AccountsPayable`
- `AccountsReceivable`
- `PurchaseOrder`
- `GoodsReceipt`
- `ProductionOrder`

9. Timeline transversal

`OrderTimelineEvent` esta correta como base.

Manter `previousStatus/newStatus` em `String` e aceitavel porque a timeline ja cobre mais de um subdominio. O importante e padronizar os valores na aplicacao e documentar `eventType`.

## 9. Proximos passos de implementacao

### Fase 1 - congelar contrato e compatibilidade

1. Publicar este documento como referencia canonica do backend.
2. Marcar no OpenAPI quais rotas sao canonicas e quais sao aliases legados.
3. Garantir que toda nova rota nasce em `/api/v1`.

### Fase 2 - convergir ownership dos modulos

4. Transformar `checkout` em adaptador de interface para `orders` e `payments`.
5. Absorver `orders-core` como alias de leitura publica e remover duplicidade de regra.
6. Consolidar `delivery-areas` dentro de `delivery`.
7. Consolidar `financial` em `finance`, `inventory` em `stock`, `kds` em `kitchen`.

### Fase 3 - endurecer nucleo transacional

8. Extrair use cases do nucleo de pedido:
   - `CreateOrder`
   - `RepriceOrder`
   - `TransitionOrderStatus`
   - `CancelOrder`
   - `ConfirmPayment`
   - `CreateRefund`
   - `DispatchOrderToKitchen`
9. Introduzir `version` nos agregados de alta concorrencia.
10. Padronizar `IdempotencyRequest` em todos os comandos criticos.

### Fase 4 - fechar seguranca e rastreabilidade

11. Implementar `CompanyScopeGuard` e `BranchScopeGuard`.
12. Evoluir refresh/session tracking.
13. Garantir timeline e auditoria para caixa, estoque, cancelamento e estorno.

### Fase 5 - consolidar realtime

14. Formalizar o catalogo de eventos compartilhados entre backend e frontend.
15. Definir `order.cancelled` como nome canonico e manter aliases temporarios.
16. Medir backlog do outbox, `ack rate`, replay e latencia de broadcast.

### Fase 6 - migrations necessarias

17. Criar migrations apenas para o que ainda falta:
   - `version`
   - unificacao `Courier` x `DeliveryDriver`
   - relacoes faltantes de compras/financeiro
   - campos extras de `Order` e `OrderItem` se o fluxo de combo/variacao exigir
   - tracking de sessao

### Fase 7 - testes obrigatorios

18. Cobrir com testes e2e:

- criacao de pedido por canal
- recalc de totais
- idempotencia
- confirmacao de pagamento
- cancelamento
- estorno
- despacho KDS
- baixa de estoque
- atualizacao de caixa/recebivel
- replay realtime

### Resultado esperado

Ao final dessas fases, o Pastelzissimo fica com:

- um contrato HTTP unico em `/api/v1`
- pedido como agregado central
- pagamento, cozinha, delivery, estoque e financeiro integrados por contratos claros
- realtime confiavel com outbox e replay
- multi-filial real por contexto e RBAC
- schema Prisma evoluindo apenas onde ainda ha gap real
