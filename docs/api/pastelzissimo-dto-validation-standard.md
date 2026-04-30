# Padrao Oficial de DTOs, Validacoes e Contratos de Entrada do Pastelzissimo

Base consolidada em 2026-04-13 a partir de:

- `docs/api/pastelzissimo-api-contract.md`
- `docs/api/pastelzissimo-canonical-routes.md`
- `apps/backend/prisma/schema.prisma`
- DTOs, controllers e filtros atuais em `apps/backend/src`

Objetivo: definir um padrao unico de entrada para NestJS + Prisma, pronto para producao, com foco em previsibilidade para frontend, seguranca operacional, multi-filial e compatibilidade futura com WebSocket, ERP, PDV e integracoes externas.

## 1. Padrao geral de DTOs

### 1.1 Regras de organizacao

Cada operacao deve ter DTO proprio. Nao reutilizar DTO de criacao para update, acao de negocio, cancelamento, pagamento, estorno ou filtros.

Estrutura recomendada por modulo:

```text
src/modules/<domain>/
  controllers/
  application/
  domain/
  dto/
    requests/
      create-<entity>.request.dto.ts
      update-<entity>.request.dto.ts
      <business-action>.request.dto.ts
    queries/
      list-<entity>.query.dto.ts
      <entity>-filters.dto.ts
    shared/
      <entity>-ref.dto.ts
      <entity>-item.input.dto.ts
      <entity>-address.input.dto.ts
```

Estrutura recomendada em `common/dto`:

```text
src/common/dto/
  pagination-query.dto.ts
  date-range-query.dto.ts
  list-query.dto.ts
  branch-scoped-query.dto.ts
  sortable-query.dto.ts
  idempotent-request.dto.ts
```

### 1.2 Taxonomia oficial

- `Base DTO`
  - Usado apenas para campos transversais e reutilizaveis.
  - Exemplo: `PaginationQueryDto`, `DateRangeQueryDto`, `BranchScopedQueryDto`.
  - Nao deve carregar regra de negocio especifica de dominio.
- `Create DTO`
  - Representa payload minimo para criar um agregado.
  - Exemplo: `CreateOrderRequestDto`, `CreateCustomerRequestDto`.
- `Update DTO`
  - Representa alteracao parcial controlada.
  - Exemplo: `UpdateOrderItemRequestDto`, `UpdateCustomerRequestDto`.
  - Nao usar `PartialType(CreateDto)` por padrao. So usar quando os mesmos campos sao realmente mutaveis e a semantica e identica.
- `List DTO`
  - Especializacao de pagina+filtros+sort.
  - Exemplo: `ListOrdersQueryDto`, `ListPaymentsQueryDto`.
- `Business Action DTO`
  - DTO de comando com efeito colateral e auditoria.
  - Exemplo: `CancelOrderRequestDto`, `ConfirmPaymentRequestDto`, `CreateRefundRequestDto`, `TransitionKitchenOrderRequestDto`.
- `Filter DTO`
  - DTO reutilizavel por conjunto de filtros.
  - Exemplo: `OrderFiltersDto`, `FinancialStatusFilterDto`.
- `Pagination DTO`
  - DTO transversal usado por todas as listagens.

### 1.3 Convencao de nomenclatura

- Requests de body:
  - `CreateOrderRequestDto`
  - `UpdateOrderRequestDto`
  - `AddOrderItemRequestDto`
  - `UpdateOrderItemRequestDto`
  - `CancelOrderRequestDto`
  - `CreateOrderPaymentRequestDto`
  - `CreatePaymentRefundRequestDto`
- Queries:
  - `ListOrdersQueryDto`
  - `ListCustomersQueryDto`
  - `ListStockMovementsQueryDto`
- DTOs compartilhados:
  - `OrderItemInputDto`
  - `OrderDeliveryInputDto`
  - `CustomerAddressInputDto`

### 1.4 Regra de ownership de contratos

- `orders` e dono do contrato do agregado pedido.
- `payments` e dono do contrato de confirmacao, captura, conciliacao e estorno.
- `kitchen` e dono do contrato de preparo e despacho de cozinha.
- `stock` e dono do contrato de item, lote e movimentacao.
- `tables` e dono do contrato de mesa, comanda, reserva e fila.

Contrato compartilhado so pode ir para `common/dto` quando for realmente transversal. Exemplo: paginacao, datas, branch scope, search, sort e idempotencia.

### 1.5 Regras obrigatorias de desenho

- IDs tecnicos vao em path/query/header, nao no body, salvo referencia de relacionamento.
- Campos calculados no servidor nunca entram no DTO de entrada.
- Em pedidos e pagamentos, o cliente nunca envia:
  - `subtotal`
  - `discountAmount`
  - `deliveryFee` final
  - `extraFee`
  - `paidAmount`
  - `refundedAmount`
  - `totalAmount`
  - `unitPrice`
  - `productNameSnapshot`
  - `costSnapshot`
  - `priceSnapshot`
- Contexto de empresa, filial, usuario e canal nao deve depender do body.

## 2. Estrategia de validacao

### 2.1 Pipe global oficial

O projeto ja possui `ValidationPipe` global em `apps/backend/src/main.ts`. O padrao oficial deve convergir para:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    forbidUnknownValues: true,
    validateCustomDecorators: true,
    stopAtFirstError: false,
    transformOptions: {
      enableImplicitConversion: false,
      exposeUnsetFields: false,
    },
    exceptionFactory: buildValidationException,
  }),
);
```

### 2.2 Padrao de uso de `class-validator` e `class-transformer`

- Usar `@Type(() => Number)` e `@Type(() => Date)` apenas quando a transformacao for explicita.
- Normalizar strings com utilitarios unicos:
  - trim
  - string vazia para `undefined`
  - email lowercase
  - telefone em formato normalizado
- Validar monetarios com no maximo 2 casas quando o dominio for monetario.
- Validar quantidades com no maximo 3 casas quando o dominio for estoque/item.
- Validar arrays com `ArrayMinSize`, `ArrayMaxSize`, `ValidateNested`.
- Validar enums com `@IsEnum`.
- Validar datas com `@IsISO8601({ strict: true })`.

### 2.3 Validacoes por camada

- DTO/Pipe
  - tipo
  - obrigatoriedade
  - range
  - tamanho
  - enum
  - formato
  - regra simples entre campos do mesmo payload
- `InputPolicy` ou `RequestValidator` do dominio
  - existencia de relacionamentos
  - pertencimento a company/branch
  - status/transicao valida
  - compatibilidade entre metodo, canal, pedido e pagamento
  - disponibilidade de item/addon/mesa/entregador
- Use case/service
  - orquestracao transacional
  - persistencia
  - side effects
  - publicacao em outbox/WebSocket

### 2.4 Como evitar validacoes duplicadas

- Nao validar regra de formato em controller e repetir em service.
- Nao fazer consulta de banco dentro de decorator customizado salvo excecoes muito pontuais.
- Centralizar regra semantica em `*InputPolicy`.
- Reutilizar helpers e decorators:
  - `@TrimmedString(max)`
  - `@MoneyField()`
  - `@QuantityField()`
  - `@OptionalUuid()`
  - `@CsvEnumArray(OrderStatus)`

### 2.5 Validacoes condicionais oficiais

Exemplos obrigatorios:

- `orderType = DELIVERY`
  - `delivery` obrigatorio
  - `tableId` e `commandId` proibidos
- `orderType = TABLE`
  - `tableId` obrigatorio
  - `delivery` proibido
- `payment.method = CASH`
  - `providerTransactionId` proibido
- `payment.method = PIX` ou `CARD`
  - `provider` e pelo menos uma referencia externa obrigatorios em confirmacao manual
- `reasonCode = OTHER`
  - `reasonText` obrigatorio
- `stockItem.controlsBatch = true`
  - `batchId` obrigatorio ou `autoBatchSelection = true`

### 2.6 Parametros de rota e query

- IDs de path devem usar `ParseUUIDPipe`.
- Inteiros de path/query devem usar `ParseIntPipe` ou DTO com `@Type`.
- Query arrays padronizadas:
  - `?status=CONFIRMED,READY`
  - `?channel=WEB,WHATSAPP`
- `sort` padrao:
  - `createdAt:desc`
  - `createdAt:desc,totalAmount:asc`

## 3. Contratos de entrada por operacao

### 3.1 Criacao de pedido

DTO oficial: `CreateOrderRequestDto`

Campos obrigatorios:

- `orderType: OrderType`
- `items: OrderItemInputDto[]` com minimo de 1 item

Campos opcionais:

- `customerId`
- `couponCode`
- `notes`
- `internalNotes`
- `tableId`
- `commandId`
- `delivery`
- `initialPayments`

DTO compartilhado de item:

```ts
class OrderItemInputDto {
  productId: string;
  quantity: number;
  notes?: string;
  addons?: OrderItemAddonInputDto[];
}
```

DTO compartilhado de entrega:

```ts
class OrderDeliveryInputDto {
  customerAddressId?: string;
  deliveryAreaId?: string;
  addressSnapshot?: CustomerAddressInputDto;
}
```

Obrigatorio por variacao:

- `DELIVERY`
  - `delivery` obrigatorio
  - `customerAddressId` ou `addressSnapshot` obrigatorio
- `TABLE`
  - `tableId` obrigatorio
- `COMMAND`
  - `commandId` obrigatorio
- `COUNTER`, `PICKUP`, `WHATSAPP`, `KIOSK`, `QR`
  - sem bloco `delivery`

Regras de contrato:

- `channel` deve vir do contexto resolvido, nao do body nas rotas privadas.
- `branchId` deve vir do contexto resolvido, nao do body.
- `initialPayments` e opcional. Pagamento nao bloqueia criacao do pedido, salvo rotas de checkout que exigem intent ou pre-autorizacao.

### 3.2 Inclusao de item

DTO oficial: `AddOrderItemRequestDto`

Campos obrigatorios:

- `productId`
- `quantity`

Campos opcionais:

- `notes`
- `addons`

Regra de semantica:

- `addons`, quando enviado, representa a lista completa desejada para o item criado.
- `quantity` deve ser maior que zero.

### 3.3 Atualizacao de item

DTO oficial: `UpdateOrderItemRequestDto`

Campos opcionais:

- `quantity`
- `notes`
- `addons`

Regras:

- Pelo menos um campo mutavel deve ser enviado.
- Se `addons` for enviado, ele substitui integralmente os adicionais atuais do item.
- Nao permitir update em item cancelado ou item de pedido em estado bloqueado.

### 3.4 Cancelamento de pedido

DTO oficial: `CancelOrderRequestDto`

Campos obrigatorios:

- `reasonCode`

Campos opcionais:

- `reasonText`
- `source`

Regras:

- `reasonText` obrigatorio quando `reasonCode = OTHER`.
- `source` pode ser preenchido internamente pelo backend com base no canal/ator.
- Em pedido pago, cancelamento e fluxo de estorno devem ser tratados de forma explicita.

### 3.5 Pagamento

DTO oficial: `CreateOrderPaymentRequestDto`

Campos obrigatorios:

- `method`
- `amount`

Campos opcionais:

- `provider`
- `transactionReference`
- `providerTransactionId`
- `metadata`

Regras:

- `amount > 0`
- `amount` com 2 casas decimais
- `provider` obrigatorio para `PIX`, `CARD` e `EXTERNAL` quando a origem for integracao ou confirmacao manual
- `transactionReference` obrigatorio para conciliacao manual

### 3.6 Estorno

DTO oficial: `CreatePaymentRefundRequestDto`

Campos obrigatorios:

- `paymentId`
- `amount`
- `reasonCode`

Campos opcionais:

- `reasonText`
- `externalReference`
- `metadata`

Regras:

- `amount > 0`
- `amount <= saldo estornavel`
- `reasonText` obrigatorio quando `reasonCode = OTHER`

### 3.7 Movimentacao de estoque

DTO oficial: `CreateStockMovementRequestDto`

Campos obrigatorios:

- `stockItemId`
- `movementType`
- `quantity`

Campos opcionais:

- `batchId`
- `unitCost`
- `reasonCode`
- `referenceType`
- `referenceId`
- `notes`

Regras:

- `quantity > 0`
- `unitCost` obrigatorio para `ENTRY` e recomendado para `ADJUSTMENT`
- `referenceType/referenceId` obrigatorios quando o movimento vier de outro agregado
- `batchId` obrigatorio quando o item controlar lote e nao houver selecao automatica FEFO

### 3.8 Cadastro de cliente

DTO oficial: `CreateCustomerRequestDto`

Campos obrigatorios:

- `name`

Campos opcionais:

- `phone`
- `whatsapp`
- `email`
- `cpfCnpj`
- `birthDate`
- `notes`
- `isVip`
- `addresses`

Regras:

- Pelo menos um meio de contato entre `phone`, `whatsapp` e `email` deve existir para cliente operacional.
- `birthDate` em ISO 8601.
- `cpfCnpj`, se informado, deve ser validado e normalizado.

### 3.9 Cadastro de mesa/comanda

Mesa: `CreateTableRequestDto`

Campos obrigatorios:

- `name`

Campos opcionais:

- `capacity`
- `qrCode`

Comanda: `OpenCommandRequestDto`

Campos opcionais:

- `tableId`
- `customerId`
- `code`

Regras:

- `branchId` sempre vem do contexto.
- `code`, quando omitido, e gerado no servidor.
- Se `tableId` for informado, a mesa deve pertencer a filial corrente.

### 3.10 Login e refresh

Login administrativo: `LoginRequestDto`

Campos obrigatorios:

- `email`
- `password`

Campos opcionais:

- `branchId`

Refresh: `RefreshTokenRequestDto`

Campos obrigatorios:

- `refreshToken`

Campos opcionais:

- nenhum por padrao

Regra oficial:

- `branchId` no login e opcional para selecao inicial de escopo.
- Troca de filial apos login deve ocorrer por operacao explicita de sessao, nao por refresh silencioso.

## 4. Regras de negocio na entrada

### 4.1 Deve ser barrado antes de persistir

- `branchId` ausente em operacao mutavel multi-filial
- `companyId` fora do escopo do token
- `channel` invalido para a rota
- item inexistente, inativo ou indisponivel para o canal/tipo do pedido
- adicional inexistente, inativo ou nao vinculado ao produto
- quantidade fora do minimo/maximo permitido
- item ou pedido com status bloqueado para a acao
- transicao de status invalida
- mesa/comanda de outra filial
- driver indisponivel para atribuicao
- pagamento maior que saldo do pedido quando nao houver overpay permitido
- estorno maior que saldo estornavel
- movimento de estoque que deixa saldo negativo sem permissao
- lote expirado quando a operacao nao permite uso

### 4.2 Regras de pedido

- `OrderStatus` aceitos por acao:
  - inclusao/edicao de item: `DRAFT`, `PENDING_CONFIRMATION`
  - confirmacao: `PENDING_CONFIRMATION`
  - preparo: `CONFIRMED`, `IN_PREPARATION`
  - cancelamento: qualquer status nao terminal conforme matriz oficial
- `deliveryAreaId`, quando informado, deve pertencer a `branchId`.
- `customerAddressId`, quando informado, deve pertencer ao cliente do pedido ou ao contexto permitido da operacao.
- `tableId` e `commandId` devem ser coerentes entre si e com `branchId`.

### 4.3 Regras de item/addon

- Produto precisa estar `isActive = true`.
- Produto precisa estar disponivel para o canal:
  - `availableDelivery`
  - `availableCounter`
  - `availableTable`
- Grupo adicional obrigatorio deve ser atendido.
- `minSelect` e `maxSelect` do grupo devem ser respeitados.
- Se `allowMultiple = false`, o mesmo `addonItemId` nao pode ser repetido.

### 4.4 Regras de pagamento

- Pagamento so pode ser confirmado em pedido nao cancelado.
- Metodo deve ser compativel com o canal e com o fluxo:
  - `PAY_ON_DELIVERY` nao pode ser usado em `TABLE`
  - `EXTERNAL` exige referencia de integracao
- Somatorio de pagamentos confirmados nao pode ultrapassar o total, salvo overpay explicitamente habilitado.

### 4.5 Regras de estoque

- Se `controlsStock = false`, nao criar movimento manual que altere saldo sem justificativa administrativa.
- Se `controlsExpiry = true`, exigir datas de lote coerentes.
- Se `requiresFefo = true`, batch manual deve respeitar FEFO ou registrar override auditado.

## 5. Padrao para filtros e listagens

### 5.1 DTO base oficial

DTO oficial transversal:

```ts
export class BaseListQueryDto extends PaginationQueryDto {
  search?: string;
  sort?: string;
  from?: string;
  to?: string;
  branchId?: string;
  status?: string[];
  channel?: string[];
  categoryId?: string;
  userId?: string;
}
```

### 5.2 Campos padrao

- `page`
  - default `1`
  - minimo `1`
- `perPage`
  - default `20`
  - maximo `100`
- `sort`
  - formato `campo:asc|desc`
  - multiplos campos separados por virgula
  - validados contra whitelist por modulo
- `search`
  - string curta, normalizada e com limite de tamanho
- `from` e `to`
  - datas ISO 8601
  - `from <= to`
- `status`
  - array de enums ou codigos validos do modulo
- `branchId`
  - filtro permitido apenas quando o ator tem acesso a mais de uma filial
- `channel`
  - array de `Channel`
- `categoryId`
  - UUID
- `userId`
  - UUID

### 5.3 Reuso por modulo

- `ListOrdersQueryDto extends BaseListQueryDto`
  - adiciona `orderType`, `customerId`, `orderNumber`
- `ListPaymentsQueryDto extends BaseListQueryDto`
  - adiciona `method`, `provider`, `orderId`
- `ListCustomersQueryDto extends BaseListQueryDto`
  - adiciona `isVip`, `isBlocked`
- `ListStockMovementsQueryDto extends BaseListQueryDto`
  - adiciona `stockItemId`, `movementType`, `referenceType`

### 5.4 Regras de compatibilidade

- `pageSize` atual deve virar alias temporario de `perPage` e entrar como deprecated.
- `startDate/endDate` devem convergir para `from/to`.
- `status` e `channel` devem convergir para arrays, nao string livre.

## 6. Padrao de headers e contexto

### 6.1 Contexto resolvido da requisicao

Toda requisicao deve gerar um `RequestContext` interno:

```ts
type RequestContext = {
  requestId: string;
  companyId: string;
  branchId?: string;
  actorId?: string;
  actorType: 'USER' | 'CUSTOMER' | 'INTEGRATION' | 'SYSTEM';
  channel: Channel;
  idempotencyKey?: string;
};
```

### 6.2 Ordem de prioridade

1. JWT ou credencial de integracao
2. Parametro de rota quando o recurso ja define escopo
3. Header tecnico
4. Query de filtro, apenas em leitura e somente quando permitido
5. Body apenas para referencias de relacionamento e nunca para escopo de autenticacao

### 6.3 Regras por header

- `Authorization`
  - obrigatorio em rotas privadas
  - define `companyId`, `actorId`, permissoes e, quando existir, `activeBranchId`
- `X-Request-Id`
  - recomendado em todas as rotas
  - se ausente, backend gera e devolve no response
- `X-Branch-Id`
  - obrigatorio em `POST/PATCH/DELETE` multi-filial quando o JWT nao trouxer filial ativa e a rota nao estiver ancorada em filial
  - ignorado se o JWT trouxer escopo fixo mais restritivo
- `X-Channel`
  - obrigatorio em integracoes e rotas publicas
  - opcional em backoffice, onde o default e `ADMIN`
- `Idempotency-Key`
  - obrigatorio nas operacoes criticas listadas na secao 7

### 6.4 Regras por tipo de operacao

- `GET`
  - `Authorization` obrigatorio nas rotas privadas
  - `X-Request-Id` recomendado
- `POST/PATCH/DELETE` internos
  - `Authorization` obrigatorio
  - `X-Branch-Id` obrigatorio quando necessario para resolver filial
  - `Idempotency-Key` obrigatorio nas rotas criticas
- `public`
  - `X-Channel` obrigatorio
  - `Idempotency-Key` obrigatorio em criacao de pedido/pagamento

## 7. Idempotencia em entradas criticas

### 7.1 Operacoes obrigatorias

- criar pedido
- confirmar pagamento
- cancelar pedido
- estornar pagamento
- movimentar estoque

### 7.2 Regra oficial

`Idempotency-Key` deve ser transportado em header e persistido em store central, nao apenas no agregado final.

Estrutura minima recomendada:

```ts
type IdempotencyRecord = {
  key: string;
  scope: string;
  fingerprint: string;
  companyId: string;
  branchId?: string;
  actorId?: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  resourceType?: string;
  resourceId?: string;
  responseStatusCode?: number;
  responseBody?: Json;
  expiresAt: Date;
};
```

### 7.3 Algoritmo oficial

1. Resolver contexto da requisicao.
2. Normalizar payload.
3. Calcular `fingerprint = method + route + context + bodyHash`.
4. Buscar `IdempotencyRecord`.
5. Se nao existir, criar como `PROCESSING`.
6. Se existir com mesmo fingerprint e `COMPLETED`, retornar resposta anterior.
7. Se existir com fingerprint diferente, responder `409 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.
8. Se existir como `PROCESSING`, responder `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` ou `202`, conforme operacao.

### 7.4 Observacao sobre o estado atual

O schema atual ja possui `Order.idempotencyKey` com `@@unique([branchId, idempotencyKey])`. Isso ajuda em criacao de pedido, mas nao cobre:

- replay seguro de resposta
- fingerprint do payload
- cancelamento
- pagamento
- refund
- estoque

Logo, a chave no pedido deve continuar, mas precisa ser complementada por um store idempotente transversal.

## 8. Validacao por dominio

### 8.1 Auth

- `email` normalizado em lowercase
- `password` com minimo de seguranca
- `refreshToken` obrigatorio e tratado como segredo
- `branchId` opcional apenas para selecao inicial de escopo

Excecoes tipicas:

- `AUTH_INVALID_CREDENTIALS`
- `AUTH_REFRESH_TOKEN_INVALID`
- `AUTH_BRANCH_NOT_ALLOWED`

### 8.2 Menu

- categoria, produto, addon e combo devem pertencer a `companyId`
- produto inativo nao pode ser exposto nem vendido
- `promotionalPrice <= salePrice`
- `recipeId` deve pertencer a mesma empresa

Excecoes:

- `MENU_PRODUCT_UNAVAILABLE`
- `MENU_ADDON_GROUP_INVALID`

### 8.3 Orders

- pedido deve respeitar matriz de transicao
- itens e adicionais precisam ser validos para o canal
- totais sempre calculados no servidor
- `branchId` obrigatorio em toda escrita

Excecoes:

- `ORDER_INVALID_STATUS_TRANSITION`
- `ORDER_ITEM_UNAVAILABLE`
- `ORDER_BRANCH_REQUIRED`
- `ORDER_CONTEXT_MISMATCH`

### 8.4 Payments

- metodo, provider e referencias externas devem ser coerentes
- pagamento nao pode exceder saldo, salvo politica explicita
- refund nao pode exceder capturado menos estornado

Excecoes:

- `PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING`
- `PAYMENT_PROVIDER_REFERENCE_REQUIRED`
- `PAYMENT_REFUND_NOT_ALLOWED`

### 8.5 Kitchen

- so pedidos confirmados entram em preparo
- item precisa ter `station` resolvida
- status de cozinha nao deve substituir status financeiro

Excecoes:

- `KITCHEN_ORDER_NOT_READY_FOR_PREPARATION`
- `KITCHEN_STATION_REQUIRED`

### 8.6 Stock

- item e lote devem existir e pertencer ao escopo permitido
- nao permitir saldo negativo quando `allowNegativeStock = false`
- batch/validade/FEFO devem ser respeitados

Excecoes:

- `STOCK_NEGATIVE_NOT_ALLOWED`
- `STOCK_BATCH_REQUIRED`
- `STOCK_ITEM_INACTIVE`

### 8.7 Finance

- caixa precisa estar aberto para certas operacoes
- conta a receber/pagar deve respeitar status permitido
- branch scope obrigatorio

Excecoes:

- `FINANCE_CASH_REGISTER_CLOSED`
- `FINANCE_INVALID_SETTLEMENT_STATUS`

### 8.8 Customers

- nome minimo
- pelo menos um canal de contato
- endereco com consistencia minima de cidade/estado/cep
- cliente bloqueado nao deve seguir para pedido em rotas operacionais

Excecoes:

- `CUSTOMER_CONTACT_REQUIRED`
- `CUSTOMER_BLOCKED`

### 8.9 Tables

- mesa deve pertencer a filial
- capacidade minima positiva
- nao abrir comanda em mesa bloqueada

Excecoes:

- `TABLE_NOT_AVAILABLE`
- `COMMAND_ALREADY_OPEN`

### 8.10 Delivery

- area de entrega deve estar ativa e pertencer a filial
- CEP continua como triagem, mas a cobertura final deve ser validada por geocodificacao e poligono, ou registrar `outsideDeliveryZone`
- motorista/entregador deve estar disponivel

Excecoes:

- `DELIVERY_AREA_NOT_AVAILABLE`
- `DELIVERY_DRIVER_UNAVAILABLE`

## 9. Erros de validacao

### 9.1 Estrutura oficial

O projeto ja possui envelope padrao no filtro HTTP global. O retorno oficial para entrada invalida deve convergir para:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Existem campos invalidos na requisicao.",
    "category": "validation",
    "origin": "POST /api/v1/orders",
    "traceId": "2c9d7c0a-8d4d-4f4a-9ef4-65c3a1d6c6a5",
    "details": {
      "fields": [
        {
          "field": "items[0].quantity",
          "code": "MIN_VALUE",
          "message": "Quantidade deve ser maior que zero.",
          "source": "body"
        }
      ]
    }
  },
  "meta": {
    "requestId": "2c9d7c0a-8d4d-4f4a-9ef4-65c3a1d6c6a5",
    "timestamp": "2026-04-13T23:00:00.000Z",
    "version": "v1"
  }
}
```

### 9.2 Regras de mensagem

- `message` geral deve ser amigavel e consistente.
- `details.fields[].message` deve ajudar o frontend a exibir erro de formulario.
- `code` deve ser estavel e machine-friendly.
- `origin` deve indicar rota ou comando.
- `category` deve usar:
  - `validation`
  - `auth`
  - `authorization`
  - `business`
  - `infrastructure`

### 9.3 Mapeamento de status HTTP

- `400`
  - payload malformado ou parametro impossivel de interpretar
- `401`
  - autenticacao invalida
- `403`
  - sem permissao ou fora do escopo
- `404`
  - recurso nao encontrado no escopo permitido
- `409`
  - conflito, concorrencia, idempotencia ou duplicidade
- `422`
  - validacao semantica e regra de negocio na entrada

## 10. Compatibilidade com frontend

### 10.1 Customer App

- mesmo contrato de pedido para quote, checkout e acompanhamento
- validacoes previsiveis para formularios de endereco, itens e pagamento
- idempotencia evita pedido duplicado por retry/rede instavel

### 10.2 Painel administrativo

- filtros e paginacao iguais em todos os grids
- erros por campo mapeaveis diretamente em forms
- contexto de filial previsivel por header/JWT

### 10.3 Cozinha

- comandos pequenos e especificos para transicao operacional
- mesma taxonomia de status entre REST e eventos WebSocket
- menos ambiguidade entre `orders`, `kds` e `kitchen`

### 10.4 Financeiro

- contratos separados para pagamento, refund, caixa e contas
- historico mais auditavel
- idempotencia reduz duplicidade em conciliacao e estorno

### 10.5 Dashboards

- `from/to`, `branchId`, `status`, `channel` e `categoryId` padronizados
- melhora cache e reaproveitamento de consultas

### 10.6 Integracoes futuras

- ERP/PDV/marketplace passam a falar com contratos estaveis
- WebSocket reutiliza a mesma semantica de enums e IDs
- outbox e eventos podem refletir o mesmo `RequestContext`

## 11. Ajustes recomendados no schema Prisma

Os ajustes abaixo sao os necessarios para suportar o padrao oficial sem ambiguidade operacional.

### 11.1 Introduzir enum de canal

Hoje `Order.channel` e `OrderTimelineEvent.channel` estao como `String`. O padrao oficial exige `enum Channel`, por exemplo:

- `ADMIN`
- `PDV`
- `WEB`
- `WHATSAPP`
- `KIOSK`
- `QR`
- `ERP`
- `MARKETPLACE`
- `CUSTOMER_APP`
- `INTEGRATION`

### 11.2 Substituir `String` por enums de status

Migrar para enum em:

- `Command.status`
- `Reservation.status`
- `Waitlist.status` (ja em enum no Prisma e validado no DTO de waitlists)
- `CashRegister.status`
- `CashMovement.movementType`
- `AccountsPayable.status`
- `AccountsReceivable.status`
- `Coupon.discountType`
- `CounterPayment.paymentMethod`
- `OrderStatusLog.previousStatus`
- `OrderStatusLog.newStatus`

### 11.3 Criar store transversal de idempotencia

Adicionar modelo semelhante a:

```prisma
model IdempotencyRequest {
  id                 String   @id @default(uuid())
  key                String
  scope              String
  fingerprint        String
  companyId          String
  branchId           String?
  actorId            String?
  status             String
  resourceType       String?
  resourceId         String?
  responseStatusCode Int?
  responseBody       Json?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  expiresAt          DateTime

  @@unique([scope, key])
  @@index([companyId, branchId])
  @@map("idempotency_requests")
}
```

### 11.4 Criar entidade de refund

`OrderPayment` atual guarda apenas acumulados (`refundedAmount`, `refundedAt`). Para estorno auditavel e idempotente, adicionar:

- `PaymentRefund` ou `OrderPaymentRefund`

Campos minimos:

- `paymentId`
- `amount`
- `reasonCode`
- `reasonText`
- `externalReference`
- `status`
- `metadata`
- `requestedById`
- `createdAt`

### 11.5 Corrigir granularidade multi-filial de estoque

O schema atual de estoque e majoritariamente company-scoped (`StockItem.currentQuantity`) e nao branch-scoped. Para uma operacao multi-filial correta, recomendar:

- adicionar `branchId` ou `stockLocationId` em `StockBatch`
- adicionar `branchId` ou `stockLocationId` em `StockMovement`
- criar `StockLocationBalance`
- manter `StockItem` como catalogo mestre e nao como saldo operacional unico

Sem isso, a validacao de entrada de estoque por filial fica incompleta.

### 11.6 Restricoes unicas recomendadas

- `TableRestaurant @@unique([branchId, name])`
- `Branch @@unique([companyId, code])` quando `code` for obrigatorio de negocio
- `StockBatch @@unique([stockItemId, batchNumber, branchId])` apos granularidade por filial/local

### 11.7 Controle de concorrencia otimista

Recomendado adicionar `version Int @default(1)` ou equivalente nos agregados de alta mutabilidade:

- `Order`
- `Command`
- `CounterOrder`
- `StockItem`

Isso habilita `If-Match` e melhora consistencia com WebSocket e operacao concorrente.

## 12. Proximos passos de implementacao

1. Criar um `RequestContextResolver` global para consolidar JWT, `X-Request-Id`, `X-Branch-Id`, `X-Channel` e `Idempotency-Key`.
2. Padronizar `common/dto` com `PaginationQueryDto`, `BaseListQueryDto`, `BranchScopedQueryDto`, `DateRangeQueryDto` e helpers de transformacao.
3. Padronizar DTOs canonicos de `orders`, `payments`, `stock`, `customers`, `tables` e `auth` usando `*.request.dto.ts` e `*.query.dto.ts`.
4. Introduzir `InputPolicy` por modulo para validar relacionamento, escopo e transicoes antes da transacao.
5. Evoluir o `HttpExceptionFilter` para serializar `details.fields[]` com `field`, `code`, `message` e `source`.
6. Eliminar `DEFAULT_COMPANY_ID` e `DEFAULT_BRANCH_ID` dos services de escrita, substituindo por contexto resolvido.
7. Implantar idempotencia transversal com tabela propria e replay seguro de resposta.
8. Migrar campos `String` de status/canal para enums Prisma.
9. Corrigir o modelo de estoque para suportar filial/localizacao.
10. Cobrir os contratos com testes:
   - unitarios de DTO e helpers
   - unitarios de `InputPolicy`
   - e2e por rota critica
   - testes de idempotencia e concorrencia

## Sintese executiva

O padrao oficial do Pastelzissimo deve separar claramente:

- shape de entrada em DTO
- contexto em `RequestContext`
- validacao semantica em `InputPolicy`
- persistencia e side effects no use case/service

O schema atual ja oferece boa base para pedidos, pagamentos, cozinha e envelope HTTP, mas ainda precisa de quatro correcoes estruturais para que o contrato seja realmente consistente em producao:

- contexto multi-filial sem defaults fixos
- enum de canal e status ainda tipados como `String`
- idempotencia transversal
- estoque com granularidade por filial/local
