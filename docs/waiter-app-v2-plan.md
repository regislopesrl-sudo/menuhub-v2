# App Garcom V2 - Plano Tecnico

## Objetivo

Adicionar o canal operacional `waiter_app` para atendimento de mesa/comanda na V2, reaproveitando Order Core, Menu Core, Orders, KDS e PDV sem duplicar regra de produto, adicional, preco ou status.

Fluxo desejado:

1. Garcom abre mesa/comanda.
2. Seleciona mesa ou cliente.
3. Adiciona produtos.
4. Escolhe adicionais.
5. Envia pedido para cozinha/KDS.
6. Pedido aparece em `/admin/orders` e `/admin/kds`.
7. Garcom adiciona novos itens depois.
8. Fechamento vai para PDV/caixa.

## Diagnostico Atual

### Ja existe no schema

- `TableRestaurant`: mesas por filial, com `name`, `capacity`, `status` e `qrCode`.
- `TableSession`: sessao aberta/fechada de mesa, com `tableId`, `branchId`, `guestCount`, `openedAt`, `closedAt`, `openedBy`, `closedBy`.
- `Command`: comanda, com `branchId`, `customerId`, `tableRestaurantId`, `tableSessionId`, `guestCount`, `code`, `status`, `openedAt`, `closedAt`.
- `Order.commandId`: pedido pode ficar vinculado a uma comanda.
- `OrderType.TABLE` e `OrderType.COMMAND`.
- `Channel.QR`, mas ainda nao existe `Channel.WAITER_APP`.
- `Product.availableTable`, usado para disponibilidade de produtos no canal de mesa/garcom.
- `WaiterPinCredential`, indicando base futura para login/PIN de garcom.

### Ja existe no backend

- `RequestContext` aceita `channel = waiter_app`.
- `ModulesService` ja define modulo `waiter_app` como `App Garcom`, desativado por padrao e habilitado em planos `pro`/`enterprise`.
- `MenuService` filtra cardapio por `availableTable` quando `ctx.channel === 'waiter_app'`.
- `MenuPrismaPort` valida produto/adicional por `availableTable` quando o canal e `waiter_app`.
- `KdsService` lista pedidos por status `CONFIRMED`, `IN_PREPARATION` e `READY`, independente de canal.
- `OrdersService` e websocket ja suportam pedido criado/status atualizado.
- `PdvService` ja calcula sessao de caixa, movimentos e fechamento, mas hoje so soma pedidos vinculados a sessao PDV no `internalNotes`.

### Lacunas encontradas

- `packages/shared-types/src/order.ts` tem `OrderChannel = 'delivery' | 'pdv' | 'whatsapp' | 'kiosk' | 'waiter'`; precisa alinhar para `waiter_app`.
- `DeliveryCheckoutInput` aceita apenas `channel: 'delivery'`.
- `PdvCheckoutInput` aceita apenas `channel: 'pdv'`.
- `CheckoutService` tem fluxos dedicados para delivery e PDV, mas nao para garcom.
- `OrderPrismaRepository.createOrder` hoje mapeia:
  - `pdv` -> `OrderType.COUNTER` + `Channel.PDV`
  - qualquer outro canal -> `OrderType.DELIVERY` + `Channel.WEB`
- Isso significa que `waiter_app` cairia errado como delivery/web se fosse usado sem ajuste.
- `OrderPrismaRepository.createOrder` nao recebe `commandId`, `tableSessionId` ou metadados de mesa.
- Ainda nao ha endpoints de mesa/comanda em `apps/api-v2/src`.
- Ainda nao ha telas `/waiter` ou `/admin/waiter` em `apps/web-v2/src/app`.
- `Channel` do Prisma nao tem `WAITER_APP`; pode-se usar `QR` temporariamente, mas o ideal de produto e auditoria e adicionar `WAITER_APP` em migration futura.

## Arquitetura Proposta

### Canal

- Canal de negocio: `waiter_app`.
- Header padrao: `x-channel: waiter_app`.
- Modulo: `waiter_app`.
- Disponibilidade de produto: `Product.availableTable`.
- Frete: sempre `0`.
- Cliente: opcional.
- Mesa/comanda: obrigatoria.
- Pagamento: nao deve ser obrigatorio na criacao do pedido; fechamento deve ir para PDV/caixa.

### Mapping recomendado

Ideal com migration:

- `Order.orderType = TABLE` ou `COMMAND`.
- `Order.channel = WAITER_APP`.
- `Order.commandId = command.id`.
- `Order.paymentStatus = UNPAID` ate fechamento.
- `Order.status = CONFIRMED` ao enviar para cozinha.

Compatibilidade sem migration:

- Usar `Order.orderType = TABLE` ou `COMMAND`.
- Usar `Order.channel = QR` como fallback tecnico.
- Guardar `sourceChannel: waiter_app`, `tableId`, `tableSessionId`, `commandId` e `waiterUserId` em `internalNotes`.
- Ainda assim preencher `Order.commandId`.

Recomendacao: fazer migration futura para `Channel.WAITER_APP`, porque `QR` representa outro canal e pode confundir relatorios, auditoria, filtros e BI.

### Decisao tecnica aplicada na preparacao

Sem migration nesta fase, a base passa a seguir uma regra defensiva:

- `delivery` persiste como `OrderType.DELIVERY` + `Channel.WEB`.
- `pdv` persiste como `OrderType.COUNTER` + `Channel.PDV`.
- `kiosk` persiste como `OrderType.KIOSK` + `Channel.KIOSK`.
- `waiter_app` persiste como `OrderType.COMMAND` + `Channel.QR` somente por compatibilidade temporaria do enum Prisma.
- `waiter_app` exige `commandId`; sem comanda, a criacao falha com mensagem clara e nao cai como delivery/web.
- `Order.commandId` e preenchido quando o canal e `waiter_app`.
- `internalNotes.sourceChannel = "waiter_app"` preserva a origem real para auditoria, filtros futuros e migration para `Channel.WAITER_APP`.

Impacto: o backend fica seguro para a proxima fase do App Garcom sem alterar o banco agora. Antes de HML/PRD, a recomendacao continua sendo criar migration para adicionar `Channel.WAITER_APP` e migrar pedidos com `internalNotes.sourceChannel = "waiter_app"`.

## Endpoints Propostos

### Mesas

```http
GET /v2/waiter/tables
```

Lista mesas da filial atual.

Resposta sugerida:

```json
{
  "data": [
    {
      "id": "table_1",
      "name": "Mesa 01",
      "capacity": 4,
      "status": "FREE",
      "openSessionId": null,
      "openCommandId": null
    }
  ]
}
```

```http
POST /v2/waiter/tables/:id/open
```

Abre `TableSession` e `Command` se nao houver sessao aberta.

Body:

```json
{
  "guestCount": 2,
  "customerId": null,
  "customerName": "Cliente mesa 01"
}
```

```http
POST /v2/waiter/tables/:id/close
```

Fecha mesa/comanda operacionalmente. Deve validar se todos os pedidos foram finalizados ou encaminhados para pagamento no PDV.

### Pedidos do App Garcom

```http
POST /v2/channels/waiter/orders
```

Cria pedido vinculado a comanda/mesa em modo rascunho ou confirmado, conforme `sendToKitchen`.

Body:

```json
{
  "storeId": "branch_1",
  "tableId": "table_1",
  "tableSessionId": "session_1",
  "commandId": "command_1",
  "customerId": null,
  "items": [
    {
      "productId": "product_1",
      "quantity": 1,
      "selectedOptions": [
        {
          "groupId": "group_1",
          "optionId": "option_1"
        }
      ]
    }
  ],
  "notes": "Sem cebola",
  "sendToKitchen": true
}
```

```http
PATCH /v2/channels/waiter/orders/:id/items
```

Adiciona novos itens depois do pedido inicial. Recomendacao: criar novo `Order` vinculado a mesma `Command`, ou criar novos `OrderItem` com controle de envio ao KDS. Para menor risco, fase 1 deve criar novo pedido incremental para a mesma comanda.

```http
PATCH /v2/channels/waiter/orders/:id/send-to-kitchen
```

Atualiza pedido para `CONFIRMED` e emite `order.created`/`order.status_updated` conforme necessario. KDS passa a listar automaticamente.

### Fechamento / PDV

Fase posterior:

```http
POST /v2/waiter/commands/:id/send-to-pdv
```

Entrega resumo da comanda para o caixa, sem capturar pagamento no App Garcom.

## Web Proposta

### Rota recomendada

Usar `/waiter` como app operacional separado do admin.

Motivos:

- Garcom nao precisa ver navegação administrativa.
- Facilita uso mobile/tablet.
- Evita expor `/admin/modules` ou configuracoes tecnicas.
- Pode ter login/PIN proprio no futuro.

Rota alternativa: `/admin/waiter` apenas para supervisao/gestao do modulo.

### Telas

1. `/waiter`
   - Lista de mesas por status.
   - Busca por mesa.
   - CTA: abrir mesa/comanda.

2. `/waiter/tables/:tableId`
   - Mesa aberta.
   - Comanda atual.
   - Itens enviados e itens ainda nao enviados.
   - Total parcial.
   - CTA: adicionar produtos, enviar para cozinha, solicitar fechamento.

3. `/waiter/menu`
   - Cardapio rapido filtrado por `availableTable`.
   - Categorias.
   - Busca.
   - Produto com adicionais/modificadores.

4. `/waiter/orders/:id`
   - Status do pedido.
   - Timeline simplificada.
   - Botao para adicionar novos itens na mesma comanda.

5. `/admin/waiter` futura
   - Monitor de mesas.
   - Comandas abertas.
   - Tempo de ocupacao.
   - Total por mesa.
   - Mesas aguardando fechamento.

## Regras de Negocio

- `companyId` e `branchId` obrigatorios no contexto.
- Mesa deve pertencer a filial atual.
- Comanda deve pertencer a mesa/filial atual.
- Nao permitir pedido sem mesa/comanda.
- Produto precisa estar `isActive`, `deletedAt = null` e `availableTable = true`.
- Adicionais seguem as regras atuais de `minSelect`, `maxSelect`, `required` e `allowMultiple`.
- Pedido enviado para cozinha deve entrar como `CONFIRMED`.
- KDS continua usando os status atuais.
- Fechamento financeiro deve ser feito no PDV.
- App Garcom nao deve abrir/fechar caixa.
- Garcom pode adicionar novos itens enquanto a comanda estiver aberta.
- Cancelamento/remocao de item ja enviado para KDS deve exigir regra separada e auditoria.

## Riscos e Decisoes

### Migration de canal

Risco: usar `Channel.QR` como fallback mistura QR code de mesa com app do garcom.

Decisao recomendada: adicionar `WAITER_APP` ao enum `Channel` em migration futura antes de producao.

### Pedido incremental vs editar pedido existente

Criar novo pedido por envio incremental e mais seguro na fase 1:

- Nao mexe em `OrderItem` ja enviado ao KDS.
- Mantem historico claro.
- Permite cozinha trabalhar por lotes.
- Fecha tudo pela mesma `Command`.

Editar pedido existente exige controle de itens enviados, itens pendentes, reversao e auditoria.

### Fechamento no PDV

Hoje `PdvService` soma pedidos por sessao PDV via `internalNotes.pdv.sessionId`.

Para comanda, sera necessario:

- endpoint de fechamento no PDV por `commandId`;
- criar movimento/recebimento no caixa;
- ou vincular pagamento final ao `CashRegister` aberto.

### Order Core

Order Core ja calcula total e valida carrinho, mas precisa aceitar `waiter_app` e um input especifico sem pagamento imediato.

## Plano de Implementacao por Fases

### Fase 0 - Preparacao de contratos

- Atualizar `OrderChannel` para incluir `waiter_app`.
- Criar `WaiterCheckoutInput` ou `WaiterOrderInput`.
- Adicionar DTOs de mesa/comanda no `shared-types` se fizer sentido.
- Definir mapping oficial de `waiter_app` no Prisma.

### Fase 1 - Backend minimo

- Criar modulo `apps/api-v2/src/waiter`.
- Criar endpoints:
  - `GET /v2/waiter/tables`
  - `POST /v2/waiter/tables/:id/open`
  - `POST /v2/waiter/tables/:id/close`
  - `POST /v2/channels/waiter/orders`
  - `PATCH /v2/channels/waiter/orders/:id/send-to-kitchen`
- Reaproveitar `MenuPrismaPort.validateItems` com `channel: waiter_app`.
- Persistir `Order.commandId`.
- Emitir eventos realtime.
- Garantir que KDS recebe pedidos `CONFIRMED`.

### Fase 2 - Web App Garcom

- Criar `/waiter`.
- Criar selecao de mesa.
- Criar cardapio rapido usando `GET /v2/menu` com header `x-channel: waiter_app`.
- Criar carrinho/comanda.
- Enviar para cozinha.
- Mostrar acompanhamento basico.

### Fase 3 - Integracao com PDV

- Criar fluxo de fechamento por comanda.
- PDV lista comandas abertas.
- Caixa recebe pagamento da comanda.
- Fechar `Command` e `TableSession`.
- Atualizar mesa para livre.

### Fase 4 - Operacao avancada

- PIN/login de garcom usando `WaiterPinCredential`.
- Permissoes por usuario.
- Cancelamento com motivo.
- Transferencia de mesa.
- Divisao de conta.
- Gorjeta/taxa de servico.
- Relatorios por garcom.

## Testes Recomendados

- Lista mesas somente da filial atual.
- Abre mesa livre.
- Bloqueia abrir mesa ja ocupada.
- Cria comanda vinculada a mesa.
- Cria pedido waiter sem frete.
- Bloqueia produto sem `availableTable`.
- Valida adicionais obrigatorios/min/max.
- Envia pedido para KDS como `CONFIRMED`.
- Pedido aparece em `/v2/orders` com canal correto.
- Pedido aparece em `/v2/kds/orders`.
- Adiciona novo pedido incremental na mesma comanda.
- Bloqueia acesso a mesa/comanda de outra filial.
- Fecha mesa somente quando regra financeira permitir.

## Conclusao

O App Garcom V2 e viavel com o schema atual para uma primeira fase, porque mesas, sessoes, comandas, `Order.commandId`, modulo `waiter_app` e disponibilidade `availableTable` ja existem.

O principal ajuste estrutural recomendado antes de producao e adicionar `Channel.WAITER_APP` ao Prisma para evitar usar `QR` como substituto. A implementacao deve priorizar pedidos incrementais vinculados a `Command`, com envio ao KDS via status `CONFIRMED` e fechamento financeiro posterior no PDV.
