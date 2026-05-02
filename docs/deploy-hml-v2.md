# Deploy HML V2 com Docker Compose + Caddy

Status atual: HML validado em 100% HTTPS.


Este guia sobe a V2 em homologação com:
- `api-v2`
- `web-v2`
- `postgres`
- `caddy` (HTTPS automático)

Domínios HML:
- `https://api-hml.menuhub.net.br` -> `api-v2`
- `https://app-hml.menuhub.net.br` -> `web-v2`
- painel admin: `https://app-hml.menuhub.net.br/admin/orders`

IP atual esperado nos registros DNS:
- `157.180.123.181`

## 1) Arquivos

- `docker-compose.hml.yml`
- `Caddyfile.hml`
- `apps/api-v2/.env.hml.example`
- `apps/web-v2/.env.hml.example`

## 2) Preparação

Na raiz do repositório:

```bash
cp apps/api-v2/.env.hml.example apps/api-v2/.env.hml
cp apps/web-v2/.env.hml.example apps/web-v2/.env.hml
```

Ajustar em `apps/api-v2/.env.hml`:
- `POSTGRES_PASSWORD`
- `MERCADO_PAGO_ACCESS_TOKEN`
- `MERCADO_PAGO_NOTIFICATION_URL`

## 3) Build e subir containers

```bash
docker compose -f docker-compose.hml.yml build
```

```bash
docker compose -f docker-compose.hml.yml up -d
```

## 4) Logs

Todos os serviços:

```bash
docker compose -f docker-compose.hml.yml logs -f
```

Somente API:

```bash
docker compose -f docker-compose.hml.yml logs -f api-v2
```

Somente WEB:

```bash
docker compose -f docker-compose.hml.yml logs -f web-v2
```

Somente Caddy:

```bash
docker compose -f docker-compose.hml.yml logs -f caddy
```

## 5) Parar ambiente

```bash
docker compose -f docker-compose.hml.yml down
```

Parar e remover volumes (cuidado: remove banco HML local):

```bash
docker compose -f docker-compose.hml.yml down -v
```

## 6) Smoke test rápido

### 6.1 Health

```bash
curl -i https://api-hml.menuhub.net.br/v2/health
```

### 6.2 Modules

```bash
curl -i https://api-hml.menuhub.net.br/v2/modules \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: admin" \
  -H "x-channel: delivery"
```

### 6.3 Menu

```bash
curl -i https://api-hml.menuhub.net.br/v2/menu \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: admin" \
  -H "x-channel: delivery"
```

### 6.4 Checkout PIX

```bash
curl -i -X POST https://api-hml.menuhub.net.br/v2/channels/delivery/checkout \
  -H "Content-Type: application/json" \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: admin" \
  -H "x-channel: delivery" \
  -d '{
    "storeId": "store-hml",
    "customer": { "name": "QA HML", "phone": "11999990000" },
    "deliveryAddress": {
      "cep": "01001000",
      "street": "Praca da Se",
      "number": "100",
      "neighborhood": "Centro"
    },
    "items": [
      { "productId": "SEU_PRODUCT_ID", "quantity": 1 }
    ],
    "paymentMethod": "PIX"
  }'
```

Esperado no retorno:
- `payment.provider = mercadopago`
- `payment.providerPaymentId` preenchido
- `payment.qrCodeText` preenchido

### 6.5 Painel admin

Abrir:
- `https://app-hml.menuhub.net.br/admin/orders`

Validar:
- listagem de pedidos
- status atualizado
- conexão realtime sem erro crítico

## 7) Configuração exigida no deploy

- API interna na porta `3202`
- WEB interna na porta `3112`
- `CORS_ORIGIN=https://app-hml.menuhub.net.br`
- `SOCKET_CORS_ORIGIN=https://app-hml.menuhub.net.br`
- `NEXT_PUBLIC_API_V2_URL=https://api-hml.menuhub.net.br`
- `NEXT_PUBLIC_API_V2_WS_URL=https://api-hml.menuhub.net.br`

## 8) DNS e SSL

Checklist DNS (A -> `157.180.123.181`):
- `api-hml.menuhub.net.br`
- `app-hml.menuhub.net.br`

Checklist SSL:
- portas `80` e `443` abertas no firewall
- Caddy com acesso de saída para ACME/Let's Encrypt
- logs do Caddy sem erro de challenge/certificado
