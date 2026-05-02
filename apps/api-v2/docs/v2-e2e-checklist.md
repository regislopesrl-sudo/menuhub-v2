# V2 E2E Checklist (API + Web)

Este roteiro valida o fluxo ponta a ponta da V2 sem tocar na V1.

## 1) Pré-requisitos

- Node/NPM instalados
- API V2 já buildada
- Web V2 buildada
- Banco disponível apenas se `MENU_PROVIDER=prisma` (para `mock`, não precisa)
- Cupom mock válido no `order-core` atual: `BEMVINDO10` (10%)

## 2) Variáveis `.env` necessárias

### API V2 (`apps/api-v2`)

- `MENU_PROVIDER=mock` (recomendado para primeiro teste)
- `DATABASE_URL=...` (obrigatório se usar `MENU_PROVIDER=prisma`)

Observação: a API V2 está em `http://localhost:3202` por padrão (definido em `apps/api-v2/src/main.ts`).

### Web V2 (`apps/web-v2`)

- `NEXT_PUBLIC_API_V2_URL=http://localhost:3202`
- `NEXT_PUBLIC_API_V2_WS_URL=http://localhost:3202`
- `NEXT_PUBLIC_MOCK_COMPANY_ID=company-demo`
- `NEXT_PUBLIC_MOCK_BRANCH_ID=branch-demo` (opcional)

## 3) Comandos para subir serviços

### Terminal A - API V2

```bash
npm run build --workspace @delivery-futuro/api-v2
npm run start --workspace @delivery-futuro/api-v2
```

### Terminal B - Web V2

```bash
npm run build --workspace @delivery-futuro/web-v2
npm run dev --workspace @delivery-futuro/web-v2
```

Abrir: `http://localhost:3112/admin/orders`

Observação: o Web V2 dev usa porta `3112` por padrão (script `dev` em `apps/web-v2/package.json`).

## 4) Headers obrigatórios para requests V2

- `x-company-id` (obrigatório)
- `x-user-role` (recomendado: `admin`)
- `x-branch-id` (opcional)
- `x-request-id` (opcional, recomendado)
- `x-channel` (opcional, recomendado: `delivery`)

## 5) Curl de exemplo - checkout

```bash
curl -X POST "http://localhost:3202/v2/channels/delivery/checkout" \
  -H "Content-Type: application/json" \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: admin" \
  -H "x-request-id: e2e-checkout-001" \
  -H "x-channel: delivery" \
  -d '{
    "storeId": "store-demo",
    "customerId": "customer-1",
    "items": [
      { "productId": "prod-1", "quantity": 1 }
    ],
    "couponCode": "BEMVINDO10",
    "paymentMethod": "PIX"
  }'
```

## 6) Script pronto para validação HTTP (checkout/list/patch)

Arquivo: [e2e-v2-orders.ps1](C:/SistemaDelivery/menuhub-delivery-main/menuhub-delivery-main/apps/api-v2/scripts/e2e-v2-orders.ps1)

Exemplo de uso:

```powershell
powershell -ExecutionPolicy Bypass -File apps/api-v2/scripts/e2e-v2-orders.ps1 `
  -ApiBase "http://localhost:3202" `
  -CompanyId "company-demo" `
  -BranchId "branch-demo" `
  -UserRole "admin" `
  -StoreId "store-demo" `
  -CouponCode "BEMVINDO10" `
  -ProductId "prod-1" `
  -Quantity 1
```

O script valida:

1. `POST /v2/channels/delivery/checkout`
2. `GET /v2/orders` (pedido aparece)
3. `PATCH /v2/orders/:id/status` para `CONFIRMED`

## 7) Checklist manual ponta a ponta (com painel)

1. Subir API V2.
2. Subir Web V2.
3. Abrir `/admin/orders`.
4. Disparar checkout (curl/script acima).
5. Confirmar no DevTools Network que `GET /v2/orders` traz o novo pedido.
6. Confirmar no painel que o pedido aparece.
7. Clicar `Confirmar` no painel.
8. Confirmar `PATCH /v2/orders/:id/status` retornando sucesso.
9. Confirmar atualização no painel por evento `order.status_updated`.

## 8) Troubleshooting de socket

- Painel não atualiza em realtime:
  - conferir `NEXT_PUBLIC_API_V2_WS_URL=http://localhost:3202`
  - conferir namespace do socket: `/v2/orders`
  - conferir handshake com `companyId` (`x-company-id`, `auth.companyId` ou `query.companyId`)

- Conecta mas sem entrar em room:
  - `companyId` ausente ou vazio
  - gateway não coloca em room sem `companyId`

- Evento chega na API mas não no browser:
  - verificar CORS do gateway (`origin: *` já habilitado na V2)
  - validar se o `companyId` do evento é o mesmo da sessão do painel
  - validar `branchId` quando usar room de filial

- Apenas polling funciona / websocket falha:
  - manter fallback `polling` ativo no client
  - verificar proxy/reverse-proxy para upgrade de websocket

- Divergência de porta:
  - API V2 usa `3202`
  - Web V2 dev usa `3112`
  - ajustar `NEXT_PUBLIC_API_V2_URL` e `NEXT_PUBLIC_API_V2_WS_URL`
