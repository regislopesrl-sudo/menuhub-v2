# Contrato da API Backend Pastelzissimo

Baseado no schema atual em `apps/backend/prisma/schema.prisma` e nos controladores existentes em `apps/backend/src`.

Objetivo: definir um contrato canonico para a API NestJS + Prisma do Pastelzissimo, com foco operacional real para pedidos, pagamentos, cozinha, estoque, financeiro, clientes, mesas/comandas, delivery, usuarios/permissoes e integracoes futuras.

## 1. Padrao geral da API

### Prefixo e versionamento

- Prefixo canonico: `/api/v1`
- Nao publicar novas rotas sem versao.
- O `main.ts` atual usa apenas `/api`; o recomendado e evoluir para `app.enableVersioning({ type: VersioningType.URI })` e publicar `/api/v1`.
- Rotas legadas podem continuar como alias temporario, mas devem ser marcadas como deprecated no Swagger e removidas em janela controlada.

### Namespaces canonicos

- Privado administrativo e operacional: `/api/v1`
- Publico para Customer App sem sessao: `/api/v1/public`
- Customer autenticado: `/api/v1/customer`
- Integracoes de entrada/saida: `/api/v1/integrations`
- Webhooks externos: `/api/v1/webhooks`

### Convencao de rotas

- Usar recursos no plural e em kebab-case.
- Exemplos:
  - `/api/v1/orders`
  - `/api/v1/orders/:id/payments`
  - `/api/v1/stock/movements`
  - `/api/v1/delivery/areas`
  - `/api/v1/tables/:id/commands`
- Nao misturar no mesmo dominio:
  - `/delivery/areas`
  - `/delivery-areas`
  - `/couriers`
  - `/drivers`
- Escolher um nome canonico e manter alias temporario somente para migracao.

### Padrao REST

- `GET /resource` lista
- `GET /resource/:id` detalha
- `POST /resource` cria
- `PATCH /resource/:id` atualiza parcialmente
- `PUT /resource/:id` somente quando a substituicao integral fizer sentido
- `DELETE /resource/:id` apenas quando a exclusao fisica for segura; para operacao critica preferir cancelamento/inativacao
- Acoes de negocio fora do CRUD devem ser tratadas como sub-recursos ou comandos explicitos:
  - `POST /orders/:id/cancellations`
  - `POST /orders/:id/payments`
  - `POST /tables/:id/commands`
  - `POST /commands/:id/close`
  - `POST /delivery/deliveries/:id/assignments`

### Metodos HTTP e status codes

- `200 OK`: leitura, atualizacao, acao sincronica concluida
- `201 Created`: criacao
- `202 Accepted`: processo assincrono aceito
- `204 No Content`: operacao sem payload de retorno
- `400 Bad Request`: payload malformado ou parametro invalido
- `401 Unauthorized`: token ausente, invalido ou expirado
- `403 Forbidden`: autenticado sem permissao ou fora do escopo
- `404 Not Found`: recurso nao encontrado no contexto permitido
- `409 Conflict`: conflito de negocio, concorrencia ou duplicidade
- `422 Unprocessable Entity`: validacao semantica/dominio
- `429 Too Many Requests`: rate limit ou abuso
- `500 Internal Server Error`: falha inesperada
- `503 Service Unavailable`: dependencia externa indisponivel

### Como manter coerencia entre modulos

- Todo modulo deve seguir o mesmo triplo de contrato:
  - `request DTO`
  - `application use case`
  - `response envelope`
- Toda excecao deve sair pelo mesmo filtro global.
- Toda listagem deve usar o mesmo contrato de paginacao.
- Todo endpoint mutavel deve carregar contexto de:
  - `companyId`
  - `branchId`
  - `actor`
  - `channel`
- Todo modulo deve ter nomes de permissao previsiveis, por exemplo:
  - `orders.view`
  - `orders.create`
  - `orders.cancel`
  - `payments.confirm`
  - `stock.adjust`

### Inconsistencias atuais que precisam convergir

- Ha rotas sem `@Controller('prefix')` e rotas montadas manualmente dentro do metodo.
- Ha sobreposicao entre `src/orders`, `src/modules/orders` e `src/modules/orders-core`.
- Ha sobreposicao entre `delivery.controller.ts` e `delivery-areas.controller.ts`.
- Ha recursos semelhantes com nomes diferentes:
  - `drivers` x `couriers`
  - `inventory` x `stock`
  - `financial/dashboard` x `reports`
  - `public/orders` x `checkout/orders`

O contrato abaixo define o caminho canonico; aliases legados podem existir, mas nao devem orientar novas integracoes.

## 2. Estrutura de request

### Regra base

Cada operacao deve ter DTO proprio. Nao reutilizar DTO de criacao em update, cancelamento ou pagamento.

Padrao recomendado:

- `CreateOrderRequestDto`
- `UpdateOrderRequestDto`
- `ChangeOrderStatusRequestDto`
- `CreateOrderPaymentRequestDto`
- `ListOrdersQueryDto`

### Estrutura base do payload

Campos de contexto nao devem depender apenas do body. Ordem de precedencia:

1. Claims do JWT
2. Header tecnico
3. Query/body

Contexto minimo processado no backend:

- `companyId`
- `branchId`
- `userId`
- `channel`
- `requestId`
- `idempotencyKey` para operacoes sensiveis

### Headers recomendados

- `Authorization: Bearer <token>`
- `X-Request-Id: <uuid>`
- `X-Branch-Id: <uuid>` para operacao multi-filial administrativa
- `X-Channel: ADMIN|PDV|WEB|WHATSAPP|KIOSK|ERP|MARKETPLACE`
- `X-Device-Fingerprint: <string>` recomendado em `login|refresh|logout` para trilha de sessao/abuso
- `Idempotency-Key: <uuid>` obrigatorio em criacao de pedido, pagamento, cancelamento e integracoes
- `If-Match: <entityVersion>` opcional para concorrencia otimista

### DTOs e validacoes obrigatorias

- Usar `class-validator` + `class-transformer`
- `whitelist: true`
- `forbidNonWhitelisted: true`
- `transform: true`
- Todo DTO deve validar:
  - tipo
  - tamanho minimo/maximo
  - enum
  - UUID
  - datas ISO 8601
  - monetarios com maximo de casas decimais permitido
  - listas vazias quando nao forem aceitaveis

### Campos opcionais

- Campo opcional deve ser de fato opcional e sem efeito colateral implicito.
- Nao usar string vazia como "sem valor"; normalizar para `null`.
- Em `PATCH`, somente campos permitidos pela regra de negocio podem ser informados.

### Enums

- Todo campo de status, tipo, metodo ou canal deve ser enum na API e, preferencialmente, no Prisma.
- O schema atual ja possui bons enums para:
  - `OrderStatus`
  - `OrderType`
  - `KitchenStation`
  - `TableStatus`
  - `StockMovementType`
- O schema ainda usa `String` em varios estados de negocio; isso deve ser corrigido nas recomendacoes finais.

### Paginacao e filtros

Padrao para `GET /resource`:

```http
GET /api/v1/orders?page=1&perPage=20&sort=createdAt:desc&status=CONFIRMED,READY&branchId=<uuid>&from=2026-04-01&to=2026-04-13&search=12345
```

DTO base:

```ts
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage = 20;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
```

### Exemplo de request canonico para criacao de pedido

```json
{
  "customerId": "uuid-opcional",
  "orderType": "DELIVERY",
  "channel": "WEB",
  "notes": "Sem cebola",
  "couponCode": "PASTEL10",
  "items": [
    {
      "productId": "uuid",
      "quantity": 2,
      "notes": "Bem passado",
      "addons": [
        {
          "addonItemId": "uuid",
          "quantity": 1
        }
      ]
    }
  ],
  "delivery": {
    "customerAddressId": "uuid",
    "deliveryAreaId": "uuid"
  },
  "payment": {
    "method": "PIX",
    "amount": 42.5,
    "provider": "MERCADO_PAGO",
    "transactionReference": "pix-123"
  }
}
```

Regras:

- `branchId` vem do escopo selecionado ou do header.
- `companyId` vem do token/escopo de integracao.
- `subtotal`, `discountAmount`, `deliveryFee`, `extraFee` e `totalAmount` sao calculados no servidor.
- `productNameSnapshot`, `unitPrice`, `costSnapshot` e `priceSnapshot` sao calculados no servidor.

## 3. Estrutura de response

### Envelope padrao

```ts
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    requestId: string;
    timestamp: string;
    version: 'v1';
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    category: 'validation' | 'auth' | 'authorization' | 'business' | 'infrastructure';
    origin?: string;
    details?: unknown;
    traceId?: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
    version: 'v1';
  };
}
```

### Entidade unica

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "orderNumber": "000123",
    "status": "CONFIRMED"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T15:30:00.000Z",
    "version": "v1"
  }
}
```

### Lista paginada

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "orderNumber": "000123"
    }
  ],
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T15:30:00.000Z",
    "version": "v1",
    "pagination": {
      "page": 1,
      "perPage": 20,
      "totalItems": 148,
      "totalPages": 8,
      "hasNextPage": true,
      "hasPreviousPage": false
    },
    "sort": [
      {
        "field": "createdAt",
        "direction": "desc"
      }
    ],
    "filters": {
      "status": [
        "CONFIRMED",
        "READY"
      ],
      "branchId": "uuid"
    }
  }
}
```

### Sucesso de acao de negocio

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "CANCELED",
    "canceledAt": "2026-04-13T16:00:00.000Z"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T16:00:00.000Z",
    "version": "v1",
    "message": "Pedido cancelado com sucesso"
  }
}
```

### Operacoes assincronas

Usar `202 Accepted` quando houver job, integracao externa ou geracao pesada:

```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "QUEUED",
    "resource": {
      "type": "report",
      "id": "sales-by-period"
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T16:05:00.000Z",
    "version": "v1",
    "message": "Solicitacao recebida e em processamento"
  }
}
```

### Acoes em tempo real

O endpoint HTTP nao precisa repetir o evento websocket, mas deve retornar informacao consistente com o estado persistido.

Exemplo:

- `POST /orders`
  - resposta HTTP: pedido criado com estado persistido
  - evento websocket: `order.created`

### Mensagens para frontend

- `message` em `meta` e opcional para sucesso.
- `error.message` sempre amigavel e pronta para UI.
- O frontend deve usar:
  - `error.code` para regra de tela
  - `error.message` para toast/modal
  - `error.details` para destacar campos/formularios

## 4. Tratamento de erros

### Contrato unico de erro

```json
{
  "success": false,
  "error": {
    "code": "ORDER_STATUS_TRANSITION_INVALID",
    "message": "O pedido nao pode ser alterado para o status informado.",
    "category": "business",
    "origin": "orders.status",
    "details": {
      "currentStatus": "READY",
      "requestedStatus": "CONFIRMED",
      "allowedTransitions": [
        "WAITING_DISPATCH",
        "OUT_FOR_DELIVERY",
        "FINALIZED"
      ]
    },
    "traceId": "uuid"
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T16:10:00.000Z",
    "version": "v1"
  }
}
```

### Estrutura obrigatoria

- `code`: codigo interno estavel e semanticamente forte
- `message`: mensagem amigavel
- `category`: classificacao tecnica
- `origin`: modulo/campo/origem da falha
- `details`: opcional
- `traceId`: opcional, obrigatorio em logs

### Categorias de erro

- `validation`
  - payload invalido
  - enum invalido
  - campo obrigatorio ausente
- `auth`
  - credenciais invalidas
  - token expirado
  - refresh token revogado
- `authorization`
  - permissao ausente
  - acesso fora da filial
- `business`
  - transicao de status invalida
  - pagamento divergente
  - estoque insuficiente
  - mesa bloqueada
  - cliente bloqueado
- `infrastructure`
  - banco indisponivel
  - gateway de pagamento indisponivel
  - webhook externo com timeout

### Padrao de codigos

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_ACCESS_TOKEN_EXPIRED`
- `AUTH_REFRESH_TOKEN_REVOKED`
- `AUTH_BRANCH_SCOPE_FORBIDDEN`
- `VALIDATION_FAILED`
- `ORDER_NOT_FOUND`
- `ORDER_STATUS_TRANSITION_INVALID`
- `ORDER_ALREADY_CANCELED`
- `ORDER_PAYMENT_AMOUNT_MISMATCH`
- `PAYMENT_DUPLICATE_TRANSACTION`
- `STOCK_NEGATIVE_NOT_ALLOWED`
- `TABLE_NOT_AVAILABLE`
- `COMMAND_ALREADY_CLOSED`
- `DELIVERY_AREA_NOT_FOUND`
- `INFRA_DATABASE_ERROR`
- `INFRA_PAYMENT_PROVIDER_UNAVAILABLE`

### Como o frontend deve interpretar

- `400/422`:
  - exibir erros de formulario
  - destacar `error.details.fields`
- `401`:
  - renovar token se possivel
  - redirecionar para login quando necessario
- `403`:
  - mostrar tela de sem permissao
- `404`:
  - tratar como recurso ausente ou fora de escopo
- `409`:
  - recarregar estado e avisar conflito
- `5xx`:
  - toast generico e log tecnico com `traceId`

### Ajuste necessario no projeto atual

O `HttpExceptionFilter` atual retorna apenas:

- `statusCode`
- `message`
- `timestamp`
- `path`

Ele deve ser substituido por um filtro padrao do contrato acima.

## 5. Validacao de payloads

### Criacao

#### Pedido

- `items` obrigatorio e nao vazio
- `quantity > 0`
- `productId` obrigatorio
- produto ativo e disponivel para o `orderType`
- adicionais validos para o produto
- minimo/maximo de selecao por grupo de adicional
- `DELIVERY` exige endereco ou `customerAddressId`
- `TABLE` exige `tableId`
- `COMMAND` exige `commandId`
- totais monetarios calculados no servidor
- `Idempotency-Key` obrigatorio

#### Cliente

- nome minimo de 2 caracteres
- telefone normalizado
- email valido quando informado
- CPF/CNPJ validado quando informado
- evitar duplicidade por `companyId + normalizedPhone`

#### Mesa/comanda

- `tableId` existente e da filial correta
- mesa nao pode estar `BLOCKED`
- comando aberto deve ter `code` unico por filial

#### Movimentacao de estoque

- `stockItemId` obrigatorio
- `movementType` obrigatorio
- `quantity > 0`
- item ativo
- se `controlsBatch = true`, `batchId` ou informacao de lote obrigatoria
- se `allowNegativeStock = false`, nao permitir saldo final negativo

### Atualizacao

- `PATCH` so aceita campos explicitamente permitidos
- nao aceitar atualizacao de:
  - `subtotal`
  - `totalAmount`
  - `createdAt`
  - `createdById`
  - snapshots financeiros
- campos sensiveis devem ser alterados por endpoints de acao, nao por update generico

### Cancelamento

- motivo obrigatorio
- apenas pedidos/comandas nao finalizados
- registrar:
  - `canceledAt`
  - `cancellationReason`
  - `canceledBy`
- cancelar pagamento ou iniciar fluxo de estorno quando aplicavel
- emitir evento de cancelamento

### Pagamento

- `paymentMethod` em enum
- `amount > 0`
- `transactionReference` obrigatoria para PIX/cartao/gateway
- valor deve bater com saldo pendente ou seguir regra de pagamento parcial
- idempotencia por:
  - `orderId`
  - `provider`
  - `transactionReference`
- pedido cancelado nao pode receber pagamento

### Movimentacao de estoque

- `ENTRY`: exige custo quando impacta CMV
- `EXIT`: exige origem
- `TRANSFER`: exige origem e destino
- `ADJUSTMENT`: exige justificativa
- `LOSS`: exige motivo sanitario/operacional
- `SALE_CONSUMPTION`: somente via processo de pedido/finalizacao
- `PRODUCTION_CONSUMPTION`: somente via ordem de producao

### Cadastro de cliente

- telefone e whatsapp normalizados para digitos
- endereco com cidade/estado/numero obrigatorios quando salvo para entrega
- cliente bloqueado nao pode abrir novo pedido sem override autorizado

### Gestao de mesa/comanda

- abrir comanda somente em mesa livre ou ocupada conforme politica
- transferir itens somente entre comandas abertas da mesma filial
- fechar comanda apenas se:
  - existir saldo zero apos pagamentos
  - ou houver politica de fiado/controlado

### Transicoes de status

As transicoes devem ser centralizadas em policy de dominio.

#### Pedido delivery

- `DRAFT -> PENDING_CONFIRMATION | CONFIRMED`
- `PENDING_CONFIRMATION -> CONFIRMED`
- `CONFIRMED -> IN_PREPARATION`
- `IN_PREPARATION -> READY`
- `READY -> WAITING_DISPATCH | OUT_FOR_DELIVERY | FINALIZED`
- `WAITING_DISPATCH -> OUT_FOR_DELIVERY`
- `OUT_FOR_DELIVERY -> DELIVERED | FINALIZED`
- `DELIVERED -> FINALIZED`
- `* -> CANCELED` conforme regra de negocio

#### Pedido pickup/balcao

- `READY -> WAITING_PICKUP | FINALIZED`
- `WAITING_PICKUP -> FINALIZED`

#### Pedido mesa/comanda

- `READY -> FINALIZED`

## 6. Organizacao por modulos

### auth

Responsabilidade:

- login administrativo
- refresh token
- logout
- sessao atual

Endpoints canonicos:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/:sessionId`
- `DELETE /api/v1/auth/sessions`
- `GET /api/v1/auth/security-events` (requer permissao administrativa)

### customer auth

Responsabilidade:

- OTP/login do cliente
- sessao do cliente

Endpoints canonicos:

- `POST /api/v1/customer/auth/request-otp`
- `POST /api/v1/customer/auth/verify-otp`
- `GET /api/v1/customer/auth/me`

Respostas de sucesso:

- `POST /api/v1/customer/auth/request-otp` -> `{ success: true, channel: 'whatsapp', phone, expiresInSeconds }`
- `POST /api/v1/customer/auth/verify-otp` -> `{ access_token }`
- `GET /api/v1/customer/auth/me` -> `{ id, phone, companyId, branchId, branchIds }`

Erros seguem o envelope padrao da API (`success: false`, `error`, `meta`).

### users

- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `PATCH /api/v1/users/:id/activate`
- `PATCH /api/v1/users/:id/deactivate`

### roles and permissions

- `GET /api/v1/roles`
- `GET /api/v1/roles/:id`
- `POST /api/v1/roles`
- `PATCH /api/v1/roles/:id`
- `GET /api/v1/permissions`

### branches

- `GET /api/v1/branches`
- `GET /api/v1/branches/:id`
- `POST /api/v1/branches`
- `PATCH /api/v1/branches/:id`
- `GET /api/v1/companies/me`
- `PATCH /api/v1/companies/me`

### menu

Separar catalogo de operacao interna.

- `GET /api/v1/menu/categories`
- `GET /api/v1/menu/products`
- `GET /api/v1/menu/products/:id`
- `POST /api/v1/menu/products`
- `PATCH /api/v1/menu/products/:id`
- `GET /api/v1/menu/addon-groups`
- `POST /api/v1/menu/addon-groups`
- `PATCH /api/v1/menu/addon-groups/:id`
- `GET /api/v1/menu/combos`
- `POST /api/v1/menu/combos`

### products

Backoffice:

- `GET /api/v1/products`
- `GET /api/v1/products/:id`
- `POST /api/v1/products`
- `PATCH /api/v1/products/:id`
- `PATCH /api/v1/products/:id/toggle`
- `DELETE /api/v1/products/:id`
- `GET /api/v1/products/:id/fiscal-profile`
- `PUT /api/v1/products/:id/fiscal-profile`

Regra:

- `products` segue como catalogo comercial administrativo;
- o perfil fiscal do produto e tratado como subrecurso proprio;
- ausencia de perfil fiscal retorna `null` no `GET`;
- o `FiscalModule` usa este perfil antes do fallback padrao.

### public checkout

- `POST /api/v1/public/checkout/quote`
- `POST /api/v1/public/checkout/orders`
- `GET /api/v1/public/checkout/orders/:id`
- `POST /api/v1/public/checkout/orders/:id/payment-intent`

### customers

- `GET /api/v1/customers`
- `GET /api/v1/customers/:id`
- `POST /api/v1/customers`
- `PATCH /api/v1/customers/:id`
- `POST /api/v1/customers/:id/addresses`
- `PATCH /api/v1/customers/:id/block`
- `PATCH /api/v1/customers/:id/unblock`

### orders

- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders`
- `PATCH /api/v1/orders/:id`
- `POST /api/v1/orders/:id/status-transitions`
- `POST /api/v1/orders/:id/cancellations`
- `POST /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/driver-assignments`

Customer:

- `GET /api/v1/customer/orders`
- `GET /api/v1/customer/orders/:id`
- `POST /api/v1/customer/orders`

### payments

- `POST /api/v1/payments/confirm`
- `POST /api/v1/orders/:id/payments`
- `GET /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/refunds`

### kitchen

- `GET /api/v1/kitchen/orders`
- `GET /api/v1/kitchen/orders/:id`
- `POST /api/v1/kitchen/orders/:id/send`
- `POST /api/v1/kitchen/orders/:id/start`
- `POST /api/v1/kitchen/orders/:id/finish`
- `PATCH /api/v1/kitchen/config`

### stock

- `GET /api/v1/stock/items`
- `GET /api/v1/stock/items/:id`
- `POST /api/v1/stock/items`
- `PATCH /api/v1/stock/items/:id`
- `GET /api/v1/stock/movements`
- `POST /api/v1/stock/movements`
- `GET /api/v1/stock/batches`
- `POST /api/v1/stock/batches`
- `GET /api/v1/stock/categories`

### finance

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
- `GET /api/v1/finance/reconciliations`
- `POST /api/v1/finance/reconciliations`
- `GET /api/v1/finance/daily-closures`
- `POST /api/v1/finance/daily-closures`
- `POST /api/v1/finance/maintenance/mark-overdue`
- `POST /api/v1/finance/maintenance/reconcile`
- `GET /api/v1/finance/maintenance/status`
- `GET /api/v1/finance/dashboard`

Mutacoes financeiras criticas exigem `Idempotency-Key` obrigatorio.

### tables and commands

- `GET /api/v1/tables`
- `GET /api/v1/tables/:id`
- `POST /api/v1/tables`
- `PATCH /api/v1/tables/:id`
- `POST /api/v1/tables/:id/commands`
- `GET /api/v1/commands`
- `GET /api/v1/commands/:id`
- `POST /api/v1/commands/:id/items`
- `POST /api/v1/commands/:id/close`
- `POST /api/v1/commands/:id/transfers`
- `POST /api/v1/commands/:id/item-transfers`

### coupons

- `GET /api/v1/coupons`
- `GET /api/v1/coupons/:id`
- `POST /api/v1/coupons`
- `PATCH /api/v1/coupons/:id`

Erros previsiveis:

- `422` para payload invalido
- `404` para cupom inexistente ou fora do escopo

### reservations and waitlists

- `waitlists` e o namespace HTTP canonico da fila de espera. O alias singular `waitlist` nao existe no runtime.

- `GET /api/v1/reservations`
- `POST /api/v1/reservations`
- `PATCH /api/v1/reservations/:id`
- `GET /api/v1/waitlists`
- `GET /api/v1/waitlists/:id`
- `POST /api/v1/waitlists`
- `PATCH /api/v1/waitlists/:id`
- `DELETE /api/v1/waitlists/:id`

Listagem de waitlists:

- query params: `page`, `limit` ou `perPage`, `search`, `status`, `sort`
- `status` aceita `WAITING`, `CALLED`, `SEATED`, `COMPLETED`, `CANCELED`, `NO_SHOW`
- `sort` aceita `createdAt`, `updatedAt`, `guestName`, `guestPhone`, `guestCount`, `status`, `customerName`, `customerPhone`
- resposta em envelope padrao com `data` e `meta`

Exemplo:

```http
GET /api/v1/waitlists?page=1&limit=20&search=ana&status=WAITING&sort=createdAt:asc
```

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "branchId": "uuid",
      "customerId": "uuid",
      "guestName": "Ana Silva",
      "guestPhone": "11999999999",
      "guestCount": 3,
      "status": "WAITING",
      "notes": "Mesa externa",
      "createdAt": "2026-04-13T15:30:00.000Z",
      "updatedAt": "2026-04-13T15:30:00.000Z",
      "customer": {
        "id": "uuid",
        "name": "Ana Silva",
        "phone": "11999999999",
        "whatsapp": "11999999999"
      }
    }
  ],
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T15:30:00.000Z",
    "version": "v1",
    "page": 1,
    "perPage": 20,
    "pageSize": 20,
    "total": 1,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Erros previsiveis:

- `422` para payload invalido
- `404` para waitlist inexistente ou fora do escopo
- `400` para ordenacao invalida ou contexto de filial ausente

### delivery

- `GET /api/v1/delivery/areas`
- `GET /api/v1/delivery/areas/:id`
- `POST /api/v1/delivery/areas`
- `PATCH /api/v1/delivery/areas/:id`
- `POST /api/v1/delivery/areas/:id/polygons`
- `GET /api/v1/delivery/areas/:id/fee-rules`
- `POST /api/v1/delivery/areas/:id/fee-rules`
- `GET /api/v1/delivery/couriers`
- `POST /api/v1/delivery/couriers`
- `PATCH /api/v1/delivery/couriers/:id`
- `POST /api/v1/delivery/deliveries/:id/assignments`
- `POST /api/v1/delivery/deliveries/:id/out-for-delivery`
- `POST /api/v1/delivery/deliveries/:id/complete`
- `GET /api/v1/public/delivery/coverage?zipCode=01001000`
  - request query: `zipCode` obrigatorio; `branchId` opcional, mas o contexto preferencial continua sendo `X-Branch-Id`
  - consulta inicial por CEP, mas a decisao final de cobertura acontece por geocodificacao + ponto dentro do poligono
  - response: `{ supported, cep, deliveryAreaId?, deliveryAreaName?, deliveryFee?, estimatedMinutes?, message, needsConfirmation?, geocodedAddress?, latitude?, longitude? }`
  - `400` para CEP invalido
  - `200` com `supported: false` quando o CEP estiver fora da area, nao puder ser geocodificado ou precisar de confirmacao adicional
- `POST /api/v1/public/delivery/coverage/coordinates`
  - request body: `{ latitude, longitude, branchId?, orderId? }`
  - consulta final por coordenadas
  - response: `{ supported, deliveryAreaId?, deliveryAreaName?, deliveryFee?, estimatedMinutes?, outsideDeliveryZone, route?, message }`

### reviews

- `GET /api/v1/reviews`
- `POST /api/v1/reviews`
- `PATCH /api/v1/reviews/:id/handle`
- `POST /api/v1/reviews/:id/reply`

Erros previsiveis:

- `422` para payload invalido
- `404` para review inexistente ou fora do escopo

### reports

- `GET /api/v1/reports/orders`
- `GET /api/v1/reports/financial`
- `GET /api/v1/reports/sales-period`
- `GET /api/v1/reports/stock`
- `GET /api/v1/reports/delivery`
- `GET /api/v1/reports/delivery-dashboard`
- `GET /api/v1/reports/operations-dashboard`
- `GET /api/v1/reports/salon-dashboard`
- `GET /api/v1/reports/hall-dashboard/overview`
- `GET /api/v1/reports/hall-dashboard/heatmap`
- `GET /api/v1/reports/crm`
- `GET /api/v1/reports/whatsapp`

Erros previsiveis:

- `422` para filtro invalido
- `400` para filial fora do escopo ou ausente no contexto

### loyalty

- `GET /api/v1/loyalty/coupons`
- `POST /api/v1/loyalty/coupons`
- `PATCH /api/v1/loyalty/coupons/:id`
- `GET /api/v1/loyalty/customers/:id`
- `POST /api/v1/loyalty/redeem`
- `GET /api/v1/loyalty/giftcards`
- `POST /api/v1/loyalty/giftcards`

Erros previsiveis:

- `422` para payload invalido
- `404` para cupom, cliente ou gift card inexistente ou fora do escopo
- `400` para resgate com saldo insuficiente

### fiscal

- `GET /api/v1/fiscal/config`
- `PUT /api/v1/fiscal/config`
- `GET /api/v1/fiscal/documents`
- `GET /api/v1/fiscal/documents/:id`
- `GET /api/v1/fiscal/documents/by-order/:orderId`
- `POST /api/v1/fiscal/documents/:id/retry`
- `POST /api/v1/fiscal/documents/:id/cancel`

Contrato inicial:

- NFC-e modelo 65;
- homologacao como ambiente inicial;
- configuracao por empresa/filial;
- perfil fiscal por produto com fallback padrao da configuracao;
- emissao assincrona apos pagamento confirmado;
- consulta por documento ou pedido;
- retry controlado para falhas ou pendencias.

Smoke de homologacao:

1. cadastrar configuracao fiscal da empresa/filial com certificado A1 valido;
2. cadastrar `ProductFiscalProfile` nos produtos que vao emitir;
3. confirmar um pagamento de pedido elegivel;
4. aguardar o worker fiscal processar o documento;
5. consultar `GET /api/v1/fiscal/documents/by-order/:orderId`;
6. se autorizado, usar `POST /api/v1/fiscal/documents/:id/cancel` para validar o ciclo de cancelamento;
7. se houver falha transitiva, usar `POST /api/v1/fiscal/documents/:id/retry`.

Pre-requisitos de homologacao:

- certificado A1 provisionado como arquivo `.pfx/.p12` ou base64 equivalente;
- senha do certificado registrada em env ou segredo referenciado pela configuracao fiscal;
- empresa/filial com `CNPJ`, `IE`/`IM` quando aplicavel, `CRT`, `serie`, `nextNumber`, `UF`, `municipio` e endereco do emissor;
- `ProductFiscalProfile` com `NCM`, `CFOP`, `origem`, `unidade fiscal` e CST/CSOSN coerentes;
- pedido pago e elegivel para emissao NFC-e;
- CSC configurado apenas se a UF/fornecedor/recorte exigir.

Interpretacao do resultado:

- sucesso: documento `AUTHORIZED` com chave, protocolo e XML persistidos;
- falha transitoria: documento `WAITING_RETRY`;
- falha definitiva/configuracao: documento `FAILED`;
- rejeicao SEFAZ: documento `REJECTED`;
- cancelamento autorizado: documento `CANCELLED`.

Erros previsiveis:

- `422` para payload de configuracao invalido;
- `404` para documento fiscal inexistente ou fora do escopo;
- `409` para documento ja emitido ou retry indevido;
- `409` para cancelamento de documento nao elegivel;
- `422` para payload de cancelamento invalido;
- `503` para provider ou autorizador temporariamente indisponivel;
- o cancelamento autorizado altera o documento para `CANCELLED` e registra trilha de auditoria.

### settings

- `GET /api/v1/settings/company`
- `PATCH /api/v1/settings/company`
- `GET /api/v1/settings/branches/:id`
- `PATCH /api/v1/settings/branches/:id`

### Responsabilidade entre modulos

- `orders` cria e muda estado do pedido
- `payments` confirma/captura/reembolsa pagamento
- `kitchen` atua sobre preparo e expedicao de item/pedido
- `stock` controla saldo e lote
- `finance` controla caixa e contas
- `delivery` controla area, entregador e trajeto
- `tables` e `commands` controlam salao

Nenhum modulo deve gravar diretamente estado central de outro modulo sem passar por caso de uso claro.

## 7. Seguranca e autenticacao

### Contrato de login

#### Login administrativo

`POST /api/v1/auth/login`

Request:

```json
{
  "email": "admin@pastelzissimo.com",
  "password": "senha"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "expiresIn": 900,
    "refreshExpiresIn": 604800,
    "user": {
      "id": "uuid",
      "name": "Operador",
      "roles": ["ADMIN"],
      "permissions": ["orders.view", "orders.create"],
      "companyId": "uuid",
      "defaultBranchId": "uuid",
      "allowedBranchIds": ["uuid-1", "uuid-2"]
    }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-04-13T16:20:00.000Z",
    "version": "v1"
  }
}
```

### Refresh token

- Rotacao obrigatoria
- Cada refresh invalida o anterior
- Refresh deve estar associado a uma sessao
- Registrar:
  - `sessionId`
  - `userAgent`
  - `ipAddress`
  - `lastUsedAt`

### Logout

- `POST /api/v1/auth/logout`
- revogar refresh atual
- revogacao operacional:
  - `GET /api/v1/auth/sessions`
  - `DELETE /api/v1/auth/sessions/:sessionId`
  - `DELETE /api/v1/auth/sessions`

### Auditoria de seguranca

- `GET /api/v1/auth/security-events`
- filtros suportados:
  - `action`
  - `outcome`
  - `email`
  - `userId`
  - `from|to`
  - `page|perPage|pageSize`
- trilha persistida por evento:
  - `userId`
  - `email`
  - `ipAddress`
  - `userAgent`
  - `deviceFingerprint`
  - `metadata`

### Guards

Ordem recomendada:

1. `JwtAuthGuard`
2. `CompanyScopeGuard`
3. `BranchScopeGuard`
4. `PermissionGuard`
5. guard especifico de feature quando necessario

### Roles e permissions

- `roles` sao agrupadores organizacionais
- `permissions` sao a unidade tecnica de autorizacao
- sempre validar permissao, nao apenas role
- `SUPER_ADMIN` pode bypass controlado

### Escopo por filial

Todo token administrativo deve carregar:

- `companyId`
- `defaultBranchId`
- `allowedBranchIds`

Toda rota sensivel deve validar:

- recurso pertence a `companyId`
- filial solicitada esta em `allowedBranchIds`

### Expiracao de sessao

- `accessToken`: 15 minutos
- `refreshToken`: 7 dias ou 14 dias conforme politica
- sessao inativa pode ser revogada antecipadamente

### Revogacao de acesso

- ao desativar usuario: revogar todas as sessoes
- ao trocar senha: revogar todas as sessoes
- ao remover acesso a filial: sessao precisa refletir novo escopo

### Rotas sensiveis

Exigem permissao forte e, em alguns casos, dupla validacao de escopo:

- usuarios, roles e settings
- abertura/fechamento de caixa
- cancelamento e estorno
- ajuste de estoque
- atribuicao de entregador

## 8. Paginacao, filtros e ordenacao

### Parametros padrao

- `page`: default `1`
- `perPage`: default `20`, maximo `100`
- `sort`: `campo:direcao`, multiplos separados por virgula
- `search`: busca textual
- `from` e `to`: periodo ISO

### Filtros comuns

- `status`
- `branchId`
- `companyId` apenas interno/integracao
- `channel`
- `categoryId`
- `userId`
- `customerId`
- `orderType`
- `paymentMethod`
- `isActive`

### Padrao de ordenacao

Exemplos:

- `sort=createdAt:desc`
- `sort=status:asc,createdAt:desc`

Campos ordenaveis devem ser whitelist por endpoint. Nao aceitar ordenacao arbitraria para evitar abuso e inconsistencias.

### Busca textual

Cada modulo define seus campos, mas o contrato deve documentar:

- `orders`
  - `orderNumber`
  - `customer.name`
  - `customer.phone`
- `customers`
  - `name`
  - `phone`
  - `email`
- `stock/items`
  - `name`
  - `code`
- `users`
  - `name`
  - `email`

### Resposta com metadados

Obrigatoria em toda listagem:

- `page`
- `perPage`
- `totalItems`
- `totalPages`
- `hasNextPage`
- `hasPreviousPage`
- `filters`
- `sort`

## 9. Integracao com eventos em tempo real

### Regra arquitetural

Fluxo recomendado:

1. Controller recebe request
2. Use case valida e persiste dentro de transacao
3. Use case registra domain event
4. Apos commit, evento e publicado para gateway/outbox
5. Frontend consome via WebSocket

O projeto atual ja possui `OrdersRealtimeService` e tipos compartilhados em `packages/shared-types`. Isso deve ser mantido como base, mas com envelope mais forte para producao.

### Eventos minimos

- `order.created`
- `order.updated`
- `order.status_changed`
- `order.canceled`
- `order.paid`
- `checkout.created`
- `checkout.paid`
- `kds.order_created`
- `kitchen.item.sent`
- `stock.movement.created`
- `alert.created`

### Rooms/canais

- filial: `branch_<branchId>`
- pedido: `order_<orderId>`
- usuario: `user_<userId>`
- cozinha: `kds_room`

### Envelope recomendado para evento

```json
{
  "eventId": "uuid",
  "eventName": "order.status_changed",
  "version": 1,
  "occurredAt": "2026-04-13T16:30:00.000Z",
  "companyId": "uuid",
  "branchId": "uuid",
  "aggregateType": "order",
  "aggregateId": "uuid",
  "actor": {
    "userId": "uuid",
    "channel": "ADMIN"
  },
  "data": {
    "orderId": "uuid",
    "previousStatus": "CONFIRMED",
    "newStatus": "IN_PREPARATION"
  }
}
```

### Casos obrigatorios

#### Pedido criado

- evento: `order.created`
- consumidores:
  - painel de pedidos
  - KDS
  - dashboards operacionais

#### Pedido atualizado

- evento: `order.updated`
- disparado para mudancas operacionais relevantes

#### Pagamento confirmado

- evento: `order.paid`
- se checkout: tambem `checkout.paid`

#### Item enviado a cozinha

- evento: `kitchen.item.sent`
- payload com:
  - `orderId`
  - `itemId`
  - `station`
  - `sentAt`

#### Estoque movimentado

- evento: `stock.movement.created`
- payload com:
  - `stockItemId`
  - `movementType`
  - `quantity`
  - `referenceType`
  - `referenceId`

#### Status alterado

- evento: `order.status_changed`
- manter alias legado apenas durante migracao

#### Alerta gerado

- evento: `alert.created`
- exemplos:
  - estoque abaixo do minimo
  - atraso no preparo
  - caixa aberto fora da politica

### Recomendacao de resiliencia

Para integracao com ERP/PDV/marketplace, adotar Outbox Pattern:

- tabela `domain_events`
- publicacao assincrona confiavel
- reprocessamento idempotente

## 10. Regras de contrato para frontend

### Customer App

Precisa de contrato simples, previsivel e seguro:

- endpoints publicos separados de administrativos
- retorno sempre com `data` e `meta`
- erros amigaveis
- pedidos e pagamento com `Idempotency-Key`
- polling e websocket coexistindo sem divergencia

### Painel administrativo

Precisa de:

- filtros padronizados
- paginacao consistente
- payloads ricos para tabelas e drawers
- eventos em tempo real por filial

### Operacao de cozinha

Precisa de:

- lista de pedidos por estacao
- eventos de criacao e mudanca de status
- itemizacao clara de adicionais e observacoes
- latencia baixa e contrato enxuto

### Financeiro

Precisa de:

- separacao entre caixa, recebiveis e pagaveis
- campos monetarios normalizados
- status padronizados
- rastreabilidade por referencia de pedido, fornecedor e operador

### Relatorios e dashboards

Precisa de:

- filtros por periodo, filial, canal e status
- consistencia semantica de datas
- enumeracoes estaveis
- endpoints resumidos separados de endpoints transacionais

### Integracao futura com ERP/PDV

O contrato deve prever:

- `externalId`
- `sourceSystem`
- `integrationStatus`
- `integrationErrors`
- `metadata`
- idempotencia por chave externa
- webhooks de entrada e saida

### WhatsApp

Contrato canonico de autoatendimento e operacao assistida:

- `GET /api/v1/webhook/whatsapp`
- `POST /api/v1/webhook/whatsapp`
- `GET /api/v1/whatsapp/conversations`
- `GET /api/v1/whatsapp/conversations/:id`
- `POST /api/v1/whatsapp/conversations/:id/send-message`
- `POST /api/v1/whatsapp/conversations/:id/assign`
- `POST /api/v1/whatsapp/conversations/:id/pause-bot`
- `POST /api/v1/whatsapp/conversations/:id/resume-bot`

Regras de runtime:

- o alias curto `/api/v1/conversations/*` nao faz parte do runtime e deve responder `404`;
- `webhook/whatsapp` continua ativo para validacao de webhook e recebimento de mensagens;
- reentregas do mesmo evento devem ser descartadas sem duplicar mensagem, item ou pedido;
- a resposta de webhook deve ser segura e idempotente, normalmente `{ ok: true }`.

Estado de conversa:

- `BOT_ACTIVE`: automacao pode responder;
- `WAITING_HUMAN`: conversa aguardando atendimento humano;
- `PAUSED`: bot pausado por operacao humana ou supervisao;
- `HUMAN_HANDOFF`: bot encerrou a intervencao e aguarda retomada humana/automacao.

Contrato de frontend:

- `GET /whatsapp/conversations` retorna lista com `customer`, `assignedTo` e ultima mensagem;
- `GET /whatsapp/conversations/:id` retorna detalhe com historico de mensagens;
- `POST /whatsapp/conversations/:id/send-message` envia texto manual e registra saida;
- `POST /whatsapp/conversations/:id/assign` transfere a conversa para um atendente;
- `POST /whatsapp/conversations/:id/pause-bot` pausa a automacao;
- `POST /whatsapp/conversations/:id/resume-bot` retoma a automacao.

Exemplo minimo de retorno da listagem:

```json
[
  {
    "id": "conv-1",
    "status": "BOT_ACTIVE",
    "customer": { "id": "cust-1", "name": "Cliente WhatsApp" },
    "assignedTo": null,
    "messages": [{ "id": "msg-1", "content": "Oi" }]
  }
]
```

Comportamento em ambiguidade:

- confianca alta: segue automaticamente;
- confianca media: pede confirmacao;
- confianca baixa: responde com fallback seguro ou handoff humano.

Erros previsiveis:

- conversa inexistente: `404`;
- item desconhecido: resposta segura sugerindo reformulacao;
- webhook duplicado: descartado sem efeito colateral;
- dependencia externa indisponivel: fallback para humano ou resposta segura.

### Regras praticas para o frontend

- nunca depender de mensagem literal para regra de negocio
- usar `error.code`
- tratar `meta.pagination`
- armazenar `requestId` para suporte
- considerar `version` da resposta

## 11. Recomendacoes finais de arquitetura

### Arquitetura de aplicacao

- Organizar por dominio:
  - `modules/orders`
  - `modules/payments`
  - `modules/kitchen`
  - `modules/stock`
  - `modules/finance`
- Dentro de cada dominio:
  - `controllers`
  - `dto`
  - `application/use-cases`
  - `domain`
  - `infrastructure`
  - `mappers`

### Padroes tecnicos recomendados

- `GlobalExceptionFilter` padronizado
- `ResponseEnvelopeInterceptor`
- `RequestContextInterceptor`
- `IdempotencyGuard` ou middleware
- `BranchScopeGuard`
- `AuditLogService`
- `OutboxPublisher`
- `OpenAPI/Swagger` como fonte oficial do contrato executavel

### Ajustes necessarios no schema atual

#### 1. Escopo de usuario por empresa/filial

Hoje `User` nao possui vinculacao explicita com `Company` ou `Branch`.

Adicionar:

- `user_company_access`
- `user_branch_access`
- ou ao menos `companyId`, `defaultBranchId` e tabela N:N de filiais

Sem isso, o contrato de autorizacao por filial fica incompleto.

#### 2. Normalizar enums hoje modelados como `String`

Converter para enum do Prisma, no minimo:

- `Command.status`
- `Reservation.status`
- `Waitlist.status` (ja em enum no Prisma e validado no DTO de waitlists)
- `OrderItem.status`
- `OrderPayment.paymentMethod`
- `OrderPayment.status`
- `PurchaseOrder.status`
- `GoodsReceipt.status`
- `CashRegister.status`
- `CashMovement.movementType`
- `AccountsPayable.status`
- `AccountsReceivable.status`
- `Coupon.discountType`
- `ProductionOrder.status`
- `Courier.commissionType`
- `Review.status`
- `Review.sentiment`
- `WhatsappMessage.direction`
- `WhatsappMessage.messageType`

#### 3. Relacoes faltantes no Prisma

O schema atual tem campos de FK importantes sem relacao explicita ou com relacoes incompletas. Ajustar:

- `Supplier.company -> Company`
- `PurchaseOrder.branch -> Branch`
- `GoodsReceipt.branch` se a filial operadora fizer parte da regra
- `CashRegister.branch -> Branch`
- `CashMovement.cashRegister -> CashRegister`
- `CashMovement.order -> Order`
- `AccountsPayable.branch -> Branch`
- `AccountsPayable.purchaseOrder -> PurchaseOrder`

Essas relacoes sao importantes para integridade e includes consistentes.

#### 4. Tabela de sessao/refresh token

Evoluir `RefreshToken` ou criar `UserSession` com:

- `sessionId`
- `userAgent`
- `ipAddress`
- `lastUsedAt`
- `revokedReason`

#### 5. Idempotencia

Criar suporte persistente para idempotencia:

- tabela `idempotency_keys`
- hash do request
- recurso criado
- resposta serializada opcional

Necessario para:

- checkout
- pagamentos
- webhooks
- integracoes ERP/PDV/marketplace

#### 6. Campos de integracao externa

Adicionar nos agregados criticos:

- `externalId`
- `sourceSystem`
- `metadata`
- `syncedAt`
- `integrationStatus`

Principalmente em:

- `Order`
- `Customer`
- `Product`
- `Payment`
- `StockMovement`

#### 7. Auditoria

Adicionar `createdById`, `updatedById` ou trilha equivalente em entidades sensiveis:

- `StockMovement`
- `CashMovement`
- `AccountsPayable`
- `AccountsReceivable`
- `Command`
- `Reservation`

#### 8. Versionamento/concorrencia

Adicionar `version` ou `rowVersion` em agregados de alta disputa:

- `Order`
- `Command`
- `CashRegister`
- `StockItem`

### Ordem pratica de implantacao

1. Congelar prefixo `/api/v1` e envelope padrao
2. Padronizar erros e paginacao
3. Convergir rotas duplicadas de pedidos e delivery
4. Fechar escopo RBAC por filial
5. Normalizar enums de status/metodo
6. Introduzir idempotencia e outbox
7. Publicar Swagger e contratos compartilhados com frontend

### Decisao recomendada para o estado atual do repositorio

O schema atual e uma boa base para:

- pedidos
- delivery
- estoque
- financeiro
- salao/comandas
- RBAC basico

Mas antes de considerar o contrato "fechado para producao", os quatro ajustes mais importantes sao:

1. escopo real de usuario por filial
2. enums em todos os estados de negocio
3. relacoes Prisma faltantes em compras/financeiro
4. idempotencia + sessao + outbox para pagamento/integracao
