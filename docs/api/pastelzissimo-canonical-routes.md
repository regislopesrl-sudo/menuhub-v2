# Rotas Canonicas da API Pastelzissimo

Base consolidada em 2026-04-13 a partir de:

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src`
- `docs/api/pastelzissimo-api-contract.md`
- consumo atual do frontend em `apps/frontend/src`

Observacoes objetivas da base atual:

- O runtime ja usa `app.setGlobalPrefix('api')` com versionamento URI no Nest, entao o alvo canonico natural e `/api/v1`.
- O frontend ainda consome majoritariamente `/api/...`, sem fixar `/api/v1`.
- Existem duplicidades reais entre `orders`, `checkout`, `orders-core/public`, `delivery`, `delivery-areas`, `commands`, `tables`, `inventory`, `stock`, `financial`, `couriers` e `drivers`.
- O schema suporta multi-filial, mas varios services ainda resolvem `companyId` e `branchId` por defaults fixos.

## 1. Principios gerais de rotas

### 1.1 Prefixo canonico

- Toda rota oficial de producao deve nascer em `/api/v1`.
- Namespaces adicionais:
  - `/api/v1` para backoffice, operacao e integracoes autenticadas
  - `/api/v1/public` para jornada anonima do Customer App
  - `/api/v1/customer` para jornada autenticada do cliente
  - `/api/v1/integrations` para integracoes de sistema a sistema
  - `/api/v1/webhooks` para callbacks externos

### 1.2 Regras de nomenclatura

- Recursos em plural.
- Kebab-case para segmentos compostos.
- Um nome canonico por conceito.
- Um owner claro por agregado de negocio.
- Evitar sinonimos no contrato publico.

Exemplos corretos:

- `/api/v1/orders`
- `/api/v1/orders/:id/payments`
- `/api/v1/delivery/areas`
- `/api/v1/stock/purchase-orders`

Exemplos que devem desaparecer como padrao:

- `/delivery-areas`
- `/delivery/areas` e `/delivery-areas` ao mesmo tempo
- `/drivers` e `/couriers` ao mesmo tempo
- `/inventory` e `/stock` ao mesmo tempo
- `/checkout/orders` e `/public/orders` para o mesmo fluxo

### 1.3 Regra REST

Usar REST quando a operacao manipula o proprio recurso:

- `GET /resource`
- `GET /resource/:id`
- `POST /resource`
- `PATCH /resource/:id`
- `DELETE /resource/:id`

Usar rota de acao quando a operacao:

- executa transicao de estado
- dispara efeitos colaterais em outros modulos
- exige auditoria explicita
- possui semantica de comando
- e sensivel a idempotencia

Exemplos:

- `POST /orders/:id/cancellations`
- `POST /orders/:id/status-transitions`
- `POST /orders/:id/refunds`
- `POST /commands/:id/close`
- `POST /kitchen/orders/:id/mark-ready`

### 1.4 Regra de ownership

- O contrato deve sempre responder: "qual modulo e dono da escrita deste estado?"
- `orders` e dono do agregado pedido.
- `payments` e dono do ciclo de pagamento.
- `kitchen` e dono da operacao de preparo, mas nao cria um segundo agregado de pedido.
- `delivery` e dono da malha logistica, nao da criacao do pedido.
- `finance` e dono do caixa e das contas, nao do cardapio nem do pedido.

### 1.5 Logica do padrao adotado

O padrao escolhido busca quatro objetivos simultaneos:

- reduzir ambiguidade para frontend e integracoes
- manter o contrato previsivel por modulo
- separar CRUD de comandos de negocio
- permitir alias legados durante migracao, sem carregar a duplicidade para frente

## 2. Mapa de modulos e responsabilidades

| Modulo | Pertence ao modulo | Nao pertence ao modulo |
| --- | --- | --- |
| `auth` | login administrativo, refresh token, logout, sessao atual, emissao de claims | cadastro de cliente, perfil de cliente, permissoes de negocio |
| `users` | usuarios internos, perfil interno, ativacao/inativacao, vinculos com roles | login, refresh token, configuracao de permissao em massa |
| `roles` | perfis, agrupamento de permissoes, atribuicao de permission codes a roles | lista mestre de permissoes, sessao de usuario |
| `permissions` | catalogo de permissoes e filtros por modulo | atribuicao de role, autenticacao |
| `branches` | cadastro e status de filial, dados operacionais da filial | company master data, key/value settings, caixa |
| `companies` | dados mestres da empresa corrente, identidade legal e comercial | settings operacionais por modulo, branches |
| `customers` | cadastro, perfil, enderecos, historico, identificacao por contato | OTP/login do cliente, pagamento, cozinha |
| `menu` | categorias, produtos, addons, combos, exposicao do cardapio | pedido, pagamento, estoque contabil |
| `orders` | pedido como agregado central, itens, status de negocio, timeline, cancelamento, totalizadores | cobertura de entrega, caixa, relatorios analiticos |
| `payments` | payment intents, confirmacoes, conciliacao, refund/estorno, visao de pagamentos | criacao do pedido, status de cozinha |
| `kitchen` | fila operacional, estacoes, preparo, despacho para cozinha, conclusao de item/pedido de preparo | pagamento, delivery area, regra de desconto |
| `stock` | itens, categorias, lotes, movimentos, ajustes, perdas, compras, recebimento, producao | caixa, contas, autenticacao |
| `finance` | caixa, movimentos de caixa, contas a pagar, contas a receber, liquidacoes | saldo de estoque, setup de entrega |
| `tables` | mesas, comandas, counter orders, reservas, waitlists e fluxo de salao | areas de entrega, cardapio administrativo |
| `delivery` | areas, fee rules, couriers, entregas, atribuicoes, serviceability publica | criacao do pedido, status de pagamento |
| `reports` | leitura analitica, dashboards, agregacoes, KPI e visoes historicas | escrita transacional |
| `settings` | configuracoes operacionais por escopo e por modulo | dados mestres de company/branch, processamento transacional |

### 2.1 Modulos satelite existentes fora do nucleo pedido

Hoje existem tambem modulos como `checkout`, `orders-core`, `inventory`, `financial`, `delivery-areas`, `delivery-drivers`, `commands`, `counter-orders`, `reviews`, `whatsapp`, `loyalty`, `maps`, `purchasing` e `production`.

Leitura atual:

- `checkout` ainda aparece como fachada ou alias de migracao para `orders` e `payments`
- `inventory`, `purchasing`, `production`, `stock-categories`, `suppliers` e `recipes` convergem sob `stock` apenas como historico de migracao; `stock` segue canonico e `inventory` nao faz mais parte da policy ativa desta fase
- `commands`, `counter-orders`, `reservations` e `waitlists` ficam no dominio funcional de `tables`
- `delivery-areas` foi removido do runtime nesta fase, enquanto `delivery-drivers` segue em convergencia para `delivery`
- `financial` vira `finance` apenas como historico de migracao; `finance` e o namespace canonico ativo
  - aliases flat de `finance` (`cash-registers`, `cash-movements`, `accounts-payable`, `accounts-receivable`) ficaram como historico, sem policy ativa nesta fase
- `kds` vira `kitchen` apenas como historico de migracao; `kitchen` e o namespace canonico ativo

## 3. Rotas canonicas por modulo

### 3.1 Auth

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/customer/auth/request-otp`
- `POST /api/v1/customer/auth/verify-otp`
- `GET /api/v1/customer/auth/me`

### 3.2 Users

- `GET /api/v1/users`
- `GET /api/v1/users/:id`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id`
- `DELETE /api/v1/users/:id`

Regra: ativacao e inativacao devem ser tratadas por `PATCH /users/:id` com `isActive`, nao por `toggle`.

### 3.3 Roles

- `GET /api/v1/roles`
- `GET /api/v1/roles/:id`
- `POST /api/v1/roles`
- `PATCH /api/v1/roles/:id`

### 3.4 Permissions

- `GET /api/v1/permissions`
- `GET /api/v1/permissions/:id`

Regra: `permissions` e catalogo read-only; atribuicao continua via `roles`.

### 3.5 Branches

- `GET /api/v1/branches`
- `GET /api/v1/branches/:id`
- `POST /api/v1/branches`
- `PATCH /api/v1/branches/:id`

### 3.6 Companies

- `GET /api/v1/companies/me`
- `PATCH /api/v1/companies/me`

### 3.7 Customers

- `GET /api/v1/customers`
- `GET /api/v1/customers/:id`
- `POST /api/v1/customers`
- `PATCH /api/v1/customers/:id`
- `DELETE /api/v1/customers/:id`
- `GET /api/v1/customers/:id/orders`
- `GET /api/v1/customers/autocomplete`
- `GET /api/v1/customers/:id/addresses`
- `POST /api/v1/customers/:id/addresses`
- `PATCH /api/v1/customers/:id/addresses/:addressId`
- `DELETE /api/v1/customers/:id/addresses/:addressId`

### 3.8 Menu

Backoffice:

- `GET /api/v1/menu/categories`
- `GET /api/v1/menu/categories/:id`
- `POST /api/v1/menu/categories`
- `PATCH /api/v1/menu/categories/:id`
- `DELETE /api/v1/menu/categories/:id`
- `GET /api/v1/menu/products`
- `GET /api/v1/menu/products/:id`
- `POST /api/v1/menu/products`
- `PATCH /api/v1/menu/products/:id`
- `DELETE /api/v1/menu/products/:id`
- `GET /api/v1/menu/addon-groups`
- `GET /api/v1/menu/addon-groups/:id`
- `POST /api/v1/menu/addon-groups`
- `PATCH /api/v1/menu/addon-groups/:id`
- `DELETE /api/v1/menu/addon-groups/:id`
- `GET /api/v1/menu/combos`
- `GET /api/v1/menu/combos/:id`
- `POST /api/v1/menu/combos`
- `PATCH /api/v1/menu/combos/:id`
- `DELETE /api/v1/menu/combos/:id`
- `POST /api/v1/menu/products/:id/price-changes`

Publico:

- `GET /api/v1/public/menu`
- `GET /api/v1/public/menu/products`
- `GET /api/v1/public/menu/products/:id`

### 3.9 Products

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

- `products` continua sendo o catalogo comercial;
- o perfil fiscal do produto e um subrecurso dedicado;
- o frontend deve tratar a ausencia do perfil como `null`, nao como erro de contrato;
- a emissao fiscal usa este subrecurso antes do fallback padrao.

### 3.10 Orders

Operacao interna:

- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `POST /api/v1/orders`
- `PATCH /api/v1/orders/:id`
- `GET /api/v1/orders/:id/timeline`
- `GET /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/status-transitions`
- `POST /api/v1/orders/:id/cancellations`
- `POST /api/v1/orders/:id/refunds`

Publico:

- `POST /api/v1/public/orders/quote`
- `POST /api/v1/public/orders`
- `GET /api/v1/public/orders/:id`
- `POST /api/v1/public/orders/:id/payment-intents`

Customer autenticado:

- `GET /api/v1/customer/orders`
- `GET /api/v1/customer/orders/:id`
- `POST /api/v1/customer/orders`
- `POST /api/v1/customer/orders/:id/cancellations`

### WhatsApp

Fluxo proprio do backend para webhook, atendimento conversacional e encaminhamento de pedidos.

- `GET /api/v1/webhook/whatsapp`
- `POST /api/v1/webhook/whatsapp`
- `GET /api/v1/whatsapp/conversations`
- `GET /api/v1/whatsapp/conversations/:id`
- `POST /api/v1/whatsapp/conversations/:id/send-message`
- `POST /api/v1/whatsapp/conversations/:id/assign`
- `POST /api/v1/whatsapp/conversations/:id/pause-bot`
- `POST /api/v1/whatsapp/conversations/:id/resume-bot`

Nota de runtime:

- o namespace canonico e `whatsapp/conversations/*`.
- os atalhos curtos `conversations/*` foram removidos do runtime e respondem `404`.
- `webhook/whatsapp` permanece ativo para verificacao e recebimento de eventos.

### 3.11 Payments

Rotas oficiais do modulo:

- `GET /api/v1/payments`
- `GET /api/v1/payments/:id`
- `POST /api/v1/payments/confirmations`
- `POST /api/v1/payments/reconciliations`
- `POST /api/v1/payments/refunds`
- `POST /api/v1/webhooks/payments/:provider`

Rotas order-bound que continuam pertencendo ao dominio de pagamentos:

- `GET /api/v1/orders/:id/payments`
- `POST /api/v1/orders/:id/payments`
- `POST /api/v1/public/orders/:id/payment-intents`
- `POST /api/v1/orders/:id/refunds`

### 3.12 Kitchen

- `GET /api/v1/kitchen/orders`
- `GET /api/v1/kitchen/orders/:id`
- `GET /api/v1/kitchen/stations/:station/orders`
- `GET /api/v1/kitchen/queue`
- `POST /api/v1/kitchen/orders/:id/send`
- `POST /api/v1/kitchen/orders/:id/start`
- `POST /api/v1/kitchen/orders/:id/mark-ready`
- `POST /api/v1/kitchen/orders/:id/finish`
- `POST /api/v1/kitchen/orders/:id/reopen`
- `POST /api/v1/kitchen/order-items/:id/start`
- `POST /api/v1/kitchen/order-items/:id/mark-ready`
- `POST /api/v1/kitchen/order-items/:id/finish`

Configuracao:

- `GET /api/v1/settings/kitchen`
- `PATCH /api/v1/settings/kitchen`

### 3.13 Stock

Inventario base:

- `GET /api/v1/stock/items`
- `GET /api/v1/stock/items/:id`
- `POST /api/v1/stock/items`
- `PATCH /api/v1/stock/items/:id`
- `GET /api/v1/stock/categories`
- `GET /api/v1/stock/categories/:id`
- `POST /api/v1/stock/categories`
- `PATCH /api/v1/stock/categories/:id`
- `DELETE /api/v1/stock/categories/:id`
- `GET /api/v1/stock/batches`
- `GET /api/v1/stock/batches/:id`
- `POST /api/v1/stock/batches`
- `GET /api/v1/stock/movements`
- `POST /api/v1/stock/adjustments`
- `POST /api/v1/stock/waste`
- `GET /api/v1/stock/variance`
- `GET /api/v1/stock/replenishment-suggestions`
- `GET /api/v1/stock/dashboard`

Compras e abastecimento:

- `GET /api/v1/stock/suppliers`
- `GET /api/v1/stock/suppliers/:id`
- `POST /api/v1/stock/suppliers`
- `PATCH /api/v1/stock/suppliers/:id`
- `DELETE /api/v1/stock/suppliers/:id`
- `GET /api/v1/stock/purchase-requests`
- `POST /api/v1/stock/purchase-requests`
- `GET /api/v1/stock/purchase-orders`
- `GET /api/v1/stock/purchase-orders/:id`
- `POST /api/v1/stock/purchase-orders`
- `PATCH /api/v1/stock/purchase-orders/:id`
- `POST /api/v1/stock/purchase-orders/:id/approvals`
- `GET /api/v1/stock/goods-receipts`
- `GET /api/v1/stock/goods-receipts/:id`
- `POST /api/v1/stock/goods-receipts`
- `POST /api/v1/stock/goods-receipts/:id/finalizations`

Producao e receita:

- `GET /api/v1/recipes`
- `GET /api/v1/recipes/product/:productId`
- `GET /api/v1/recipes/:id`
- `POST /api/v1/recipes`
- `PUT /api/v1/recipes/:id`

Producao:

- `GET /api/v1/production/orders`
- `POST /api/v1/production/orders`
- `POST /api/v1/production/orders/:id/start`
- `POST /api/v1/production/orders/:id/finish`
- `POST /api/v1/production/orders/:id/cancel`

### 3.14 Finance

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

### 3.15 Tables

Mesas:

- `GET /api/v1/tables`
- `GET /api/v1/tables/:id`
- `POST /api/v1/tables`
- `PATCH /api/v1/tables/:id`

Comandas:

- `GET /api/v1/commands`
- `GET /api/v1/commands/:id`
- `POST /api/v1/tables/:id/commands`
- `POST /api/v1/commands/:id/items`
- `PATCH /api/v1/commands/:id`
- `POST /api/v1/commands/:id/close`
- `POST /api/v1/commands/:id/transfers`
- `POST /api/v1/commands/:id/item-transfers`

Counter orders:

- `GET /api/v1/counter-orders`
- `GET /api/v1/counter-orders/:id`
- `POST /api/v1/counter-orders`
- `POST /api/v1/counter-orders/:id/payments`
- `GET /api/v1/counter-orders/:id/payments-summary`
- `POST /api/v1/counter-orders/:id/guest-splits/auto`
- `POST /api/v1/counter-orders/:id/items/:itemId/splits`
- `GET /api/v1/counter-orders/:id/items/:itemId/splits`
- `DELETE /api/v1/counter-orders/:id/items/:itemId/splits/:splitId`
- `POST /api/v1/counter-orders/merges`

### 3.16 Coupons

- `GET /api/v1/coupons`
- `GET /api/v1/coupons/:id`
- `POST /api/v1/coupons`
- `PATCH /api/v1/coupons/:id`

### 3.17 Reservas e fila

- `GET /api/v1/reservations`
- `POST /api/v1/reservations`
- `PATCH /api/v1/reservations/:id`
- `GET /api/v1/waitlists`
- `GET /api/v1/waitlists/:id`
- `POST /api/v1/waitlists`
- `PATCH /api/v1/waitlists/:id`
- `DELETE /api/v1/waitlists/:id`

Namespace HTTP canonico:

- `waitlists` e o unico namespace montado para a fila de espera.
- `waitlist` nao existe no runtime.

### 3.18 Reviews

- `GET /api/v1/reviews`
- `POST /api/v1/reviews`
- `PATCH /api/v1/reviews/:id/handle`
- `POST /api/v1/reviews/:id/reply`

### 3.19 Delivery

Configuracao de malha:

- `GET /api/v1/delivery/areas`
- `GET /api/v1/delivery/areas/:id`
- `POST /api/v1/delivery/areas`
- `PATCH /api/v1/delivery/areas/:id`
- `DELETE /api/v1/delivery/areas/:id`
- `GET /api/v1/delivery/areas/:id/polygons`
- `POST /api/v1/delivery/areas/:id/polygons`
- `DELETE /api/v1/delivery/areas/:areaId/polygons/:polygonId`
- `GET /api/v1/delivery/areas/:id/fee-rules`
- `POST /api/v1/delivery/areas/:id/fee-rules`
- `PATCH /api/v1/delivery/areas/:areaId/fee-rules/:ruleId`
- `DELETE /api/v1/delivery/areas/:areaId/fee-rules/:ruleId`

Operacao logistica:

- `GET /api/v1/delivery/couriers`
- `GET /api/v1/delivery/couriers/:id`
- `POST /api/v1/delivery/couriers`
- `PATCH /api/v1/delivery/couriers/:id`
- `PATCH /api/v1/delivery/couriers/:id/location`
  - `GET /api/v1/delivery/deliveries`
- `GET /api/v1/delivery/deliveries/:id`
- `POST /api/v1/delivery/deliveries`
- `POST /api/v1/delivery/deliveries/:id/dispatch`
- `POST /api/v1/delivery/deliveries/:id/complete`
- `POST /api/v1/delivery/deliveries/:id/fail`

Serviceability publica:

- `GET /api/v1/public/delivery/coverage`
  - triagem por CEP, com decisao final por geocodificacao + poligono
- `POST /api/v1/public/delivery/coverage/coordinates`
  - decisao final por coordenadas/poligono

### 3.20 Reports

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

### 3.21 Loyalty

- `GET /api/v1/loyalty/coupons`
- `POST /api/v1/loyalty/coupons`
- `PATCH /api/v1/loyalty/coupons/:id`
- `GET /api/v1/loyalty/customers/:id`
- `POST /api/v1/loyalty/redeem`
- `GET /api/v1/loyalty/giftcards`
- `POST /api/v1/loyalty/giftcards`

### 3.22 Fiscal

- `GET /api/v1/fiscal/config`
- `PUT /api/v1/fiscal/config`
- `GET /api/v1/fiscal/documents`
- `GET /api/v1/fiscal/documents/:id`
- `GET /api/v1/fiscal/documents/by-order/:orderId`
- `POST /api/v1/fiscal/documents/:id/retry`
- `POST /api/v1/fiscal/documents/:id/cancel`

Regra operacional:

- NFC-e modelo 65 em homologacao como recorte inicial;
- emissao assincrona disparada por pagamento confirmado;
- frontend consulta documento por pedido ou por id;
- item fiscal usa `ProductFiscalProfile` com fallback padrao da configuracao;
- cancelamento controlado disponivel para documentos autorizados;
- configuracao fiscal por empresa/filial.

### 3.23 Settings

- `GET /api/v1/settings`
- `PATCH /api/v1/settings`
- `GET /api/v1/settings/company`
- `PATCH /api/v1/settings/company`
- `GET /api/v1/settings/branches/:branchId`
- `PATCH /api/v1/settings/branches/:branchId`
- `GET /api/v1/settings/kitchen`
- `PATCH /api/v1/settings/kitchen`
- `GET /api/v1/settings/delivery`
- `PATCH /api/v1/settings/delivery`
- `GET /api/v1/settings/payments`
- `PATCH /api/v1/settings/payments`

## 4. Eliminacao de duplicidades

Nesta secao, os blocos `Situacao atual` registram o legado ou a transicao ainda viva, enquanto os blocos `Padrao canonico`
registram o estado alvo recomendado.

### 4.1 `orders` vs `checkout` vs `orders-core/public` vs `sales`

Estado canonico atual:

- `POST /api/v1/orders` para operacao interna
- `POST /api/v1/customer/orders` para cliente autenticado
- `POST /api/v1/public/orders` para jornada publica
- `GET /api/v1/public/orders/:id` para rastreio publico
- `POST /api/v1/public/orders/quote` para simulacao
- `POST /api/v1/public/orders/:id/payment-intents` para pre-pagamento, com ownership HTTP ainda no `checkout` nesta fase

Legado em transicao / historico de migracao:

- `POST /orders`
- `POST /orders/customer`
- `POST /checkout/orders` historico, fora da policy ativa
- `GET /checkout/orders/:id` historico, fora da policy ativa
- `POST /checkout/orders/:id/payment-intent` historico, fora da policy ativa
- `POST /public/orders`
- `POST /public/checkout/quote` historico, fora da policy ativa
- `POST /sales`

Decisao:

- `orders` continua sendo o agregado central.
- `checkout` deixa de ser modulo publico de contrato; vira fachada interna ou alias de migracao.
- `sales` deixa de existir no contrato publico e vira caso de uso interno do dominio `orders` ou `tables/counter-orders`.

### 4.2 `delivery` vs `delivery-areas`

Estado canonico atual:

- `delivery.controller.ts` concentra o contrato canonico de `delivery/areas`.
- `delivery-areas` foi removido do runtime; o contrato canonico de areas de entrega vive em `delivery/areas/*`.
- `delivery-areas/resolve-by-point` ja tinha sido removido em corte anterior; o canônico e `public/delivery/coverage/coordinates`.
- a cobertura continua sendo polygon-first: o poligono define se atende e a distancia define a taxa quando o modo da area for `PER_KM`.
- a origem da rota para calculo por km vem do endereco cadastrado da filial. Quando a filial nao tiver coordenadas salvas, o backend tenta geocodificar o endereco da loja e persistir latitude/longitude.
- o frontend nao calcula taxa localmente; ele consome `insideCoverage`, `distanceKm`, `deliveryFee`, `pricingMode`, `baseFee`, `pricePerKm` e `areaId/branchId` vindos do backend.

Padrao canonico:

- tudo sob `/api/v1/delivery/areas`

Historico de migracao:

- manter um unico controller de contrato para `delivery/areas`
- remover rotas legadas duplicadas de `delivery-areas`
- manter apenas alias temporarios legados

### 4.3 `customers` vs `auth`

Situacao atual:

- `customer/auth/*` resolve identidade
- `customers/*` resolve perfil

Padrao canonico:

- `customer/auth/*` para sessao do cliente
- `customers/*` para CRM e cadastro

Decisao:

- nunca colocar login dentro de `customers`
- nunca tratar profile master dentro de `auth`

### 4.4 `payments` vs `orders`

Situacao atual:

- `POST /orders/:id/payments`
- `POST /payments/confirm`
- `POST /checkout/orders/:id/payment-intent`

Padrao canonico:

- pagamento order-bound em `/orders/:id/payments`
- intents order-bound em `/public/orders/:id/payment-intents`
- confirmacao provider/integracao em `/payments/confirmations`
- refund em `/orders/:id/refunds` ou `/payments/refunds` quando provider-driven

Decisao:

- `orders` expÃƒÂµe sub-recursos financeiros do proprio pedido
- `payments` fica com comandos de gateway, confirmacao, conciliacao e webhook

### 4.5 `kitchen` vs `orders`

Situacao atual:

- `PATCH /orders/:id/status`
- `PATCH /kds/orders/:id/status`
- `PATCH /kds/orders/:id/start|ready|finish|reopen`

Padrao canonico:

- `POST /orders/:id/status-transitions` para mudanca genÃƒÂ©rica
- `POST /kitchen/orders/:id/start`
- `POST /kitchen/orders/:id/mark-ready`
- `POST /kitchen/orders/:id/finish`
- `POST /kitchen/orders/:id/reopen`

Decisao:

- `kitchen` escreve transicoes operacionais de preparo
- `orders` continua dono do estado final persistido
- `/kds` deixa de ser nome de contrato e nao faz mais parte da policy ativa

### 4.6 `inventory` vs `stock`

Situacao atual:

- `inventory/balances`
- `inventory/movements`
- `stock/items`
- `stock/movements`

Padrao canonico:

- tudo sob `/api/v1/stock/...`

Decisao:

- `inventory` vira alias tecnico ou modulo interno
- `stock` vira namespace unico de estoque

### 4.7 `financial` vs `finance`

Situacao atual:

- rotas flat historicas: `cash-registers`, `cash-movements`, `accounts-payable`, `accounts-receivable`, `financial/dashboard`

Padrao canonico:

- tudo sob `/api/v1/finance/...`

Decisao:

- manter recursos flat apenas como alias legado por tempo limitado

### 4.8 `couriers` vs `drivers`

Situacao atual:

- `Courier` e branch-scoped
- `DeliveryDriver` e global, com status e localizacao

Padrao canonico:

- `couriers` como recurso operacional oficial de entrega

Decisao:

- `drivers` deve ser descontinuado no contrato publico
- se tracking em tempo real continuar necessario, seus campos devem convergir para `Courier` ou virar capacidade interna do modulo `delivery`

## 5. Acoes de negocio fora do REST puro

### 5.1 Quando usar endpoint proprio

Usar endpoint proprio quando houver:

- transicao de maquina de estados
- efeitos colaterais em mais de um agregado
- emissao de evento ou outbox
- necessidade de motivo, operador e trilha de auditoria
- necessidade de idempotencia

### 5.2 Acoes que merecem endpoint proprio

- `POST /orders/:id/cancellations`
- `POST /orders/:id/refunds`
- `POST /orders/:id/status-transitions`
- `POST /public/orders/:id/payment-intents`
- `POST /commands/:id/close`
- `POST /commands/:id/transfers`
- `POST /kitchen/orders/:id/send`
- `POST /kitchen/orders/:id/start`
- `POST /kitchen/orders/:id/mark-ready`
- `POST /kitchen/orders/:id/finish`
- `POST /delivery/deliveries`
- `POST /delivery/deliveries/:id/dispatch`
- `POST /delivery/deliveries/:id/complete`
- `POST /finance/cash-registers/:id/close`
- `POST /stock/adjustments`
- `POST /stock/waste`
- `POST /menu/products/:id/price-changes`

### 5.3 Acoes que devem ser modeladas como update de recurso

- ativar/inativar usuario
- bloquear/desbloquear cliente
- alterar status online de courier
- alterar localizacao de courier
- editar dados de branch
- editar dados de produto sem trocar politica de preco
- editar settings

Padrao:

- `PATCH /resource/:id` com payload parcial e validacao de campos permitidos

### 5.4 Regra para verbs no path

Evitar verbos genÃƒÂ©ricos quando existir sub-recurso semantico melhor:

- preferir `POST /orders/:id/cancellations` a `POST /orders/:id/cancel`
- preferir `POST /orders/:id/refunds` a `POST /orders/:id/refund`

Manter verbo curto no path apenas quando o comando e operacional e altamente reconhecivel:

- `POST /commands/:id/close`
- `POST /kitchen/orders/:id/mark-ready`
- `POST /finance/cash-registers/:id/close`

## 6. Versionamento e compatibilidade

### 6.1 Regra de versao

- `/api/v1` e a unica base oficial para novas integracoes.
- `/api` pode continuar temporariamente como alias de compatibilidade.
- rotas antigas com outro path podem existir como alias internos, nunca como referencia de documentacao nova.

### 6.2 Como introduzir nova versao

Criar `v2` apenas quando houver:

- quebra de payload ou semantica
- troca de ownership de recurso
- remocao de comportamento legados
- troca de nome de campo que o frontend consome

### 6.3 Como manter compatibilidade

- expor `/api/v1/...` e `/api/...` durante a janela de migracao
- documentar alias legados com `deprecated: true`
- responder header de deprecacao
- medir trafego por rota legado antes de remover

### 6.4 Ciclo recomendado de descontinuidade

1. Publicar rota canonica em `/api/v1`.
2. Manter alias legado apontando para o mesmo use case.
3. Marcar alias como deprecated no OpenAPI.
4. Publicar changelog com data alvo de remocao.
5. Remover alias somente depois de zerar ou controlar o trafego dependente.

## 7. Padrao de parametros

### 7.1 Route params

Usar somente para identidade do recurso:

- `:id`
- `:branchId`
- `:itemId`
- `:ruleId`

Nao colocar filtros de busca em route param.

### 7.2 Query params

Usar para:

- paginacao
- ordenacao
- filtros
- busca textual
- projection/view
- expand/include

Padrao:

- `page`
- `perPage`
- `sort`
- `search`
- `status`
- `from`
- `to`
- `branchId`
- `branchIds`
- `channel`
- `view`
- `include`

### 7.3 Headers

Usar para contexto tecnico:

- `Authorization`
- `X-Request-Id`
- `X-Branch-Id`
- `X-Channel`
- `Idempotency-Key`
- `If-Match`

### 7.4 Body

Usar para estado de negocio mutavel.

Regra:

- nao carregar `companyId` no body de rotas autenticadas
- evitar `branchId` no body quando o contexto puder vir de header ou claim
- aceitar `branchId` no body apenas em fluxos publicos ou integracoes externas em que nao existe sessao operadora

### 7.5 Contexto de filial

Ordem recomendada:

1. claim `defaultBranchId` ou `branchIds` do JWT
2. `X-Branch-Id`
3. query `branchId`
4. body `branchId` apenas em contexto publico/integration

### 7.6 Contexto de canal

Padrao:

- `X-Channel` para chamadas de sistema
- `channel` no body somente quando o proprio pedido nasce com esse atributo

Valores recomendados:

- `ADMIN`
- `PDV`
- `WEB`
- `WHATSAPP`
- `KIOSK`
- `QR`
- `ERP`
- `MARKETPLACE`
- `INTEGRATION`

### 7.7 Contexto de usuario

O usuario nunca deve ser informado por body para operacao autenticada.

Vir do JWT:

- `sub`
- `companyId`
- `defaultBranchId`
- `branchIds`
- `roles`
- `permissions`

## 8. Convencao de nomes

### 8.1 Controllers

Padrao:

- `<Resource>Controller` para CRUD simples
- `<Module><Resource>Controller` para leitura ou comandos especializados

Exemplos:

- `OrdersController`
- `OrderPaymentsController`
- `KitchenOrdersController`
- `DeliveryAreasController`
- `FinanceCashRegistersController`

### 8.2 Services

Separar camadas:

- `application` com use cases
- `domain` com regras puras
- `infrastructure` com adaptadores

Padrao de nome:

- `CreateOrderService`
- `CancelOrderService`
- `AssignDeliveryService`
- `ListCustomersService`

Evitar service monolitico com tudo dentro.

### 8.3 DTOs

Padrao:

- `CreateOrderRequestDto`
- `UpdateOrderRequestDto`
- `ListOrdersQueryDto`
- `CreateOrderPaymentRequestDto`
- `CreateOrderCancellationRequestDto`

### 8.4 Guards

- `JwtAccessGuard`
- `JwtCustomerGuard`
- `PermissionGuard`
- `BranchScopeGuard`

### 8.5 Interceptors

- `ResponseEnvelopeInterceptor`
- `IdempotencyInterceptor`
- `AuditTrailInterceptor`

### 8.6 Filters

- `HttpExceptionFilter`
- `DomainExceptionFilter`
- `PrismaExceptionFilter`

### 8.7 Events

Usar nomes em passado, sem ambiguidade:

- `OrderCreatedEvent`
- `OrderCanceledEvent`
- `OrderStatusChangedEvent`
- `PaymentConfirmedEvent`
- `PaymentRefundedEvent`
- `StockAdjustedEvent`
- `CashRegisterClosedEvent`

### 8.8 Utils compartilhados

Evitar `utils.ts` generico.

Preferir:

- `order-status.mapper.ts`
- `money.parser.ts`
- `branch-context.resolver.ts`
- `idempotency-key.service.ts`

### 8.9 Regra de coerencia entre codigo e contrato

- o nome da classe deve refletir o recurso da rota
- o nome do DTO deve refletir o tipo de request
- o nome do permission code deve refletir a mesma semantica da rota
- o evento emitido deve refletir a mesma semantica do comando HTTP

## 9. Padrao de listagem e detalhe

### 9.1 Listagem paginada

Padrao:

`GET /api/v1/orders?page=1&perPage=20&sort=createdAt:desc`

Resposta:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "requestId": "uuid",
    "version": "v1",
    "page": 1,
    "perPage": 20,
    "total": 0,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### 9.2 Busca textual

Padrao:

- `search=texto`

Aplicar em:

- nome
- telefone
- codigo do pedido
- SKU
- documento

### 9.3 Filtros

Padrao minimo:

- `status`
- `from`
- `to`
- `branchId`
- `channel`

Padrao adicional por recurso:

- `orderType`
- `customerId`
- `categoryId`
- `supplierId`
- `paymentStatus`

### 9.4 Detalhe por ID

Padrao:

- `GET /resource/:id`

### 9.5 Visao resumida e completa

Nao criar `/summary` e `/full` como rotas separadas.

Padrao:

- `GET /orders/:id?view=summary`
- `GET /orders/:id?view=full`
- `GET /orders?view=summary`

Opcional para joins:

- `include=items,payments,timeline`

### 9.6 Ordenacao

Padrao:

- `sort=createdAt:desc`
- `sort=status:asc,createdAt:desc`

Nao expor nomes internos de coluna que nao fazem parte do contrato.

## 10. Padrao para acoes criticas

### 10.1 Regras gerais

Toda rota critica deve exigir:

- autenticacao valida
- permissao especifica
- `X-Request-Id`
- `Idempotency-Key` quando houver escrita sensivel
- auditoria de `actor`, `branch`, `channel`, `timestamp`
- registro de evento de dominio ou timeline

### 10.2 Pagamento

Exigencias:

- idempotencia obrigatoria
- referencia externa do provider quando existir
- reconciliacao de total pago vs total do pedido
- bloqueio de pagamento duplicado
- rastreio por `transactionReference` e `providerTransactionId`

### 10.3 Cancelamento

Exigencias:

- motivo obrigatorio
- actor obrigatorio
- validacao da maquina de estados
- timeline e outbox obrigatorios
- efeito colateral controlado em estoque, cozinha, entrega e financeiro

### 10.4 Estorno/refund

Exigencias:

- idempotencia obrigatoria
- valor parcial vs total validado
- relacao explicita com pagamento original
- registro de motivo e operador

### 10.5 Ajuste de estoque

Exigencias:

- motivo e tipo obrigatorios
- actor obrigatorio
- before/after snapshot
- origem de referencia

### 10.6 Fechamento de caixa

Exigencias:

- confirmacao de saldos
- resumo por metodo de pagamento
- travamento contra fechamento duplicado
- auditoria de operador e filial

### 10.7 Alteracao de preco

Exigencias:

- permission code dedicado
- trilha de auditoria
- possibilidade de `effectiveAt`
- opcao de motivo

### 10.8 Mudanca de status de pedido

Exigencias:

- rota de comando, nao patch cego
- validacao da transicao
- side effects encapsulados
- emissao de evento realtime e persistencia em timeline

## 11. Compatibilidade com frontend

### 11.1 Customer App

Fica mais simples porque separa claramente:

- `public/menu`
- `public/orders`
- `customer/auth`
- `customer/orders`

Isso elimina ambiguidade entre:

- o menu do cliente e o catalogo interno legado
- `/checkout/orders` historico e `/orders/customer` historico
- `/customer/auth` e o namespace canonico do Customer App

### 11.2 Painel administrativo

Ganhos:

- todos os recursos internos ficam previsiveis em `/api/v1`
- filtros e paginaÃƒÂ§ÃƒÂ£o seguem um unico contrato
- modulos administrativos deixam de depender de rotas legacy flat

### 11.3 Cozinha

Ganhos:

- a tela KDS passa a consumir `kitchen/*`
- o nome do contrato fica de negocio, nao de implementacao tecnica
- a semantica do websocket pode seguir o mesmo vocabulario de `orders`, `kitchen` e `delivery`

### 11.4 Financeiro

Ganhos:

- transacional em `finance/*`
- analitico em `reports/*`
- sem mistura entre `finance/dashboard` e relatorios

### 11.5 Dashboards

Ganhos:

- dashboards saem de rotas ad hoc e entram em `reports/dashboards/*`
- filtros de periodo, filial e canal ficam consistentes

### 11.6 Integracoes futuras

A convencao favorece:

- ERP via `/integrations/*`
- webhooks via `/webhooks/*`
- PDV e kiosk usando o mesmo agregado `orders`
- realtime usando o mesmo vocabulario de recursos e eventos

## 12. Recomendacoes de migracao

### 12.1 Manter

- `auth/login`
- `auth/refresh`
- `auth/logout`
- `auth/me`
- `users`
- `roles`
- `customers`
- `orders`
- `tables`
- `commands`
- `reports`

### 12.2 Historico de migracao

- `frontend route /catalog` consumindo `public/menu`
- `checkout` dentro de `public/orders`
- `orders-core/public` dentro de `public/orders`
- `sales` dentro de `orders` ou `counter-orders`
- `delivery-areas` dentro de `delivery/areas`
- `inventory` historicamente dentro de `stock`, sem policy ativa nesta fase
- `financial` historicamente dentro de `finance`, sem policy ativa nesta fase
  - aliases flat de `finance` historicamente existiram, mas nao fazem mais parte da policy ativa desta fase
- `kds` historicamente dentro de `kitchen`, sem policy ativa nesta fase
- `drivers` dentro de `delivery/couriers`

### 12.3 Legado em transicao

- `/sales`
- `/delivery-areas/*` removido do runtime; `resolve-by-point` foi tratado em corte anterior
- `/inventory/*` historico, fora da policy ativa
- `/financial/*`
- `/drivers/*`
- `frontend route /catalog/*` consumindo `public/menu`
- `/checkout/*`
- `/public/orders` sem namespace canonico final escolhido

### 12.4 Plano de migracao sem parada

1. Criar controllers canonicos apontando para os mesmos services.
2. Manter aliases legados respondendo para os mesmos use cases.
3. Adicionar telemetria por rota legado.
4. Atualizar frontend para consumir `/api/v1`.
5. Atualizar OpenAPI e colecoes de testes.
6. Publicar janela de sunset.
7. Remover aliases por lote, modulo a modulo.

### 12.5 Ordem sugerida

1. `auth`, `users`, `roles`, `customers`
2. `menu`, `orders`, `payments`
3. `kitchen`, `delivery`
4. `tables`
5. `stock`, `finance`
6. `reports`, `settings`

## 13. Ajustes recomendados no schema Prisma

Os ajustes abaixo sao necessarios ou muito recomendados para o contrato acima ficar robusto em producao.

### 13.1 Transformar `String` em enums onde o dominio ja esta fechado

Prioridade alta:

- `Command.status`
- `Reservation.status`
- `Waitlist.status` (ja em enum no Prisma e validado no DTO de waitlists)
- `CashRegister.status`

Prioridade media:

- `CashMovement.movementType`
- `Supplier.commissionType`
- `PurchaseOrder.status`
- `GoodsReceipt.status`

### 13.2 Consolidar `Courier` e `DeliveryDriver`

Hoje existem dois agregados de motorista/entregador:

- `Courier` branch-scoped e ligado a `CourierDelivery`
- `DeliveryDriver` com `status`, `isOnline` e localizacao

Recomendacao:

- escolher `Courier` como agregado oficial
- mover para ele os campos de tracking em tempo real
- descontinuar `DeliveryDriver` do contrato publico

### 13.3 Adicionar colunas de concorrencia otimista

Adicionar `version` ou `rowVersion` em:

- `Order`
- `OrderPayment`
- `StockItem`
- `CashRegister`
- `Product`

Uso:

- suportar `If-Match`
- evitar overwrite silencioso

### 13.4 Expandir suporte a idempotencia

Hoje `Order` ja possui `idempotencyKey`, mas o sistema precisa de cobertura tambem para:

- pagamentos
- refunds
- cancelamentos
- fechamento de caixa
- ajustes de estoque

Opcoes:

- adicionar `idempotencyKey` por agregado critico
- ou criar tabela dedicada de requests idempotentes

### 13.5 Reforcar auditoria

Adicionar `createdById`, `updatedById`, `closedById`, `approvedById` ou equivalentes onde faltar, especialmente em:

- `CashRegister`
- `CashMovement`
- `AccountsPayable`
- `AccountsReceivable`
- `PurchaseOrder`
- `GoodsReceipt`
- `ProductionOrder`

### 13.6 Padronizar soft delete

Hoje alguns agregados usam `deletedAt` e outros nao.

Padrao recomendado para recursos administrativos:

- `Product`
- `Customer`
- `User`
- `TableRestaurant`
- `Command`
- `Supplier`
- `Courier`
- `DeliveryArea`

### 13.7 Claims de tenant e branch

Nao e ajuste direto no schema Prisma, mas e indispensavel para o contrato:

- incluir `companyId`
- incluir `defaultBranchId`
- incluir `branchIds`

nas claims dos JWTs internos.

### 13.8 Timebox do pedido

O schema de `Order` ja esta forte para timeline e outbox. O que falta e padronizar seu uso em todos os comandos:

- toda transicao critica deve gravar `OrderTimelineEvent`
- toda mudanca relevante deve ser candidata a outbox realtime

## 14. Proximos passos de implementacao

1. Criar um `RequestContextResolver` central para company, branch, channel e actor.
2. Parar de depender de `DEFAULT_COMPANY_ID` e `DEFAULT_BRANCH_ID` dentro dos services transacionais.
3. Criar controllers canonicos em `/api/v1` sem remover os aliases atuais.
4. Marcar rotas legadas com `deprecated` no OpenAPI.
5. Extrair use cases de `OrdersService`, `DeliveryService`, `FinancialService` e `StockService`.
6. Criar `BranchScopeGuard` e `IdempotencyInterceptor`.
7. Unificar `kds` em `kitchen`, `financial` em `finance` e `inventory` em `stock`.
8. Unificar `delivery-areas` em `delivery/areas` e decidir a convergencia `Courier` vs `DeliveryDriver`.
9. Criar modulo read-only de `permissions`.
10. Atualizar o frontend para `/api/v1` e para as novas rotas canonicas.
11. Padronizar eventos websocket com o mesmo vocabulario dos recursos HTTP.
12. Cobrir os aliases legados com testes de regressao durante a janela de migracao.

## Resumo executivo

O desenho canonico recomendado para o Pastelzissimo e:

- `/api/v1` como base unica
- `orders` como agregado central
- `payments`, `kitchen`, `delivery`, `stock`, `finance` e `tables` como modulos especializados, sem sobrepor ownership
- `public` e `customer` como namespaces explicitos para as jornadas do app
- aliases legados mantidos apenas para migracao controlada

Os maiores cortes de duplicidade necessarios agora sao:

- `checkout` + `orders-core/public` + `sales` -> `public/orders`
- `delivery` + `delivery-areas` -> `delivery/areas`
- `inventory` -> `stock`
- `financial` -> `finance`
- `kds` -> `kitchen`
- `drivers` -> `delivery/couriers`

## Status de implementacao (2026-04-17)

Rotas canonicas implementadas no backend mantendo compatibilidade legada:

- `GET /permissions` e `GET /permissions/:id` adicionados para fechar o modulo RBAC.
- `GET /branches/:id` adicionado.
- `POST /orders/:id/status-transitions` adicionado.
- `POST /orders/:id/cancellations` adicionado.
- `POST /orders/:id/driver-assignments` adicionado.
- `POST /orders/:id/items/:itemId/cancellations` adicionado.
- `GET /orders/:id/timeline` adicionado.
- `GET /orders/:id/payments` adicionado.
- `POST /payments/confirmations` adicionado.
- `POST /payments/reconciliations` adicionado.
- `POST /tables/:tableId/commands` adicionado.
- `POST /commands/:id/close` adicionado.
- `POST /commands/:id/transfers` adicionado.
- `POST /commands/:id/item-transfers` adicionado.
- Aliases canonicos de delivery adicionados para `delivery/couriers`, `delivery/deliveries/*`, `delivery/areas/*` e `public/delivery/coverage`.
- Aliases canonicos de estoque adicionados para `stock/adjustments`.
- Aliases canonicos de cozinha adicionados com `POST` para acoes (`start`, `mark-ready`, `finish`, `reopen` e acoes de item).
- Quote publico consolidado com alias `POST /public/orders/quote`.

Mapa de migracao legado -> canonico para rollout:

- `/checkout/orders` -> `/public/orders`
- `/checkout/orders/:id` -> `/public/orders/:id`
- `/checkout/orders/:id/payment-intent` -> `/public/orders/:id/payment-intents`
- `/public/checkout/quote` historico, fora da policy ativa
- `/orders/:id/cancel`, `/orders/:id/assign-driver`, `/orders/:id/status` e `/orders/:id/items/:itemId/remove` historicos, fora da policy ativa
- `/couriers/*` historico, fora da policy ativa; o contrato canônico de couriers vive em `delivery/couriers/*`
- `/deliveries/*` removido do runtime; `delivery/deliveries/*` e o contrato canonico
- `/delivery-areas/*` removido do runtime
- `/kds/*` historico, fora da policy ativa

Pendencias restantes para fechamento completo em producao:

- criar politica tecnica unica de deprecacao/sunset em runtime (headers de deprecacao centralizados por rota legada);
- completar convergencia de `drivers` para `couriers` no dominio e schema;
- consolidar definitivamente `checkout`/`orders-core` como fachada interna sem contrato publico proprio;
- evoluir ajustes de schema Prisma restantes (enums e convergencia final de agregados), apos migracoes aplicadas em 2026-04-17.

Atualizacao operacional 2026-04-17:

- frontend migrado para consumo canonico em `checkout` (`/public/orders`), `stock` (`/stock/*`), `kitchen` (`/kitchen/*`) e `finance` (`/finance/dashboard`);
- controller legado `/checkout/*` removido da exposicao do Nest (mantida apenas fachada publica canonica);
- controllers legados de `orders-core` (`/public/checkout/quote`, `/public/orders`, `/sales`) removidos da exposicao;
- `DeliveryDriversModule` e `InventoryModule` removidos do `AppModule`;
- migration Prisma aplicada com sucesso no ambiente: `20260417020000_realtime_websocket_hardening` e `20260417100000_canonical_schema_version_audit_hardening`.

Atualizacao operacional 2026-04-18:

- compatibilidade websocket legada `/api/kds/events` removida do backend;
- websocket canonico consolidado em `/api/kitchen/events` para cozinha;
- controller HTTP legado `kds.controller.ts` removido fisicamente;
- fallback legado `/api/kds/events` removido do frontend de cozinha.
