# Deploy V2 - Domínios MenuHub

Este documento padroniza deploy da V2 com os domínios reais de HML e PRD.
IP real do servidor: `157.180.123.181`.

## 1) Mapeamento de domínios

## Produção (PRD)
- `app.menuhub.net.br` -> `web-v2` cliente
- `admin.menuhub.net.br` -> `web-v2` painel admin
- `api.menuhub.net.br` -> `api-v2`

## Homologação (HML)
- `app-hml.menuhub.net.br` -> `web-v2`
- `api-hml.menuhub.net.br` -> `api-v2`
- Painel admin HML: `https://app-hml.menuhub.net.br/admin/orders`

Observação: não existe `admin-hml.menuhub.net.br` neste momento.

## 2) Variáveis de ambiente (HML)

## api-v2 (.env)
```env
NODE_ENV=production
PORT=3202

# CORS HTTP
CORS_ORIGIN=https://app-hml.menuhub.net.br

# CORS WebSocket
SOCKET_CORS_ORIGIN=https://app-hml.menuhub.net.br

# Payment provider (sandbox)
PAYMENT_PROVIDER=mercadopago
MERCADO_PAGO_ACCESS_TOKEN=TEST-xxxxxxxx
MERCADO_PAGO_NOTIFICATION_URL=https://api-hml.menuhub.net.br/v2/payments/webhook/mercadopago
MERCADO_PAGO_API_BASE_URL=https://api.mercadopago.com
MERCADO_PAGO_TIMEOUT_MS=10000
```

Se sua API aceitar múltiplas origens em string (csv), recomendado em HML:
```env
CORS_ORIGIN=https://app-hml.menuhub.net.br
SOCKET_CORS_ORIGIN=https://app-hml.menuhub.net.br
```

## web-v2 (.env)
```env
NEXT_PUBLIC_API_V2_URL=https://api-hml.menuhub.net.br
NEXT_PUBLIC_API_V2_WS_URL=https://api-hml.menuhub.net.br

# Contexto mock atual (até auth real)
NEXT_PUBLIC_MOCK_COMPANY_ID=company-demo
NEXT_PUBLIC_MOCK_BRANCH_ID=branch-demo
```

## 3) Variáveis de ambiente (PRD)

## api-v2 (.env)
```env
NODE_ENV=production
PORT=3202

# CORS HTTP
CORS_ORIGIN=https://app.menuhub.net.br,https://admin.menuhub.net.br

# CORS WebSocket
SOCKET_CORS_ORIGIN=https://app.menuhub.net.br,https://admin.menuhub.net.br

# Payment provider (produção Mercado Pago)
PAYMENT_PROVIDER=mercadopago
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxxxxxx
MERCADO_PAGO_NOTIFICATION_URL=https://api.menuhub.net.br/v2/payments/webhook/mercadopago
MERCADO_PAGO_API_BASE_URL=https://api.mercadopago.com
MERCADO_PAGO_TIMEOUT_MS=10000
```

## web-v2 (.env)
```env
NEXT_PUBLIC_API_V2_URL=https://api.menuhub.net.br
NEXT_PUBLIC_API_V2_WS_URL=https://api.menuhub.net.br

# Contexto mock atual (até auth real)
NEXT_PUBLIC_MOCK_COMPANY_ID=company-prod
NEXT_PUBLIC_MOCK_BRANCH_ID=branch-prod
```

## 4) CORS e Socket CORS

## Regras esperadas
- `CORS_ORIGIN` deve permitir domínios do frontend que chamam REST.
- `SOCKET_CORS_ORIGIN` deve permitir domínios do frontend que abrem WebSocket.
- Em HML: somente `app-hml.menuhub.net.br`.
- Em PRD: `app.menuhub.net.br` e `admin.menuhub.net.br`.

## 5) Checklist DNS

- Registros `A` devem apontar para `157.180.123.181`.
- `api-hml.menuhub.net.br A 157.180.123.181`
- `app-hml.menuhub.net.br A 157.180.123.181`
- `api.menuhub.net.br A 157.180.123.181`
- `app.menuhub.net.br A 157.180.123.181`
- `admin.menuhub.net.br A 157.180.123.181`

Checklist adicional:
- `A/AAAA` ou `CNAME` de `app.menuhub.net.br` apontando para infra do `web-v2` PRD.
- `A/AAAA` ou `CNAME` de `admin.menuhub.net.br` apontando para infra do `web-v2` PRD.
- `A/AAAA` ou `CNAME` de `api.menuhub.net.br` apontando para infra do `api-v2` PRD.
- `A/AAAA` ou `CNAME` de `app-hml.menuhub.net.br` apontando para infra do `web-v2` HML.
- `A/AAAA` ou `CNAME` de `api-hml.menuhub.net.br` apontando para infra do `api-v2` HML.
- TTL coerente para janela de deploy (ex.: 60-300s em cutover).

## 6) Checklist SSL/TLS

- Certificados válidos para:
  - `app.menuhub.net.br`
  - `admin.menuhub.net.br`
  - `api.menuhub.net.br`
  - `app-hml.menuhub.net.br`
  - `api-hml.menuhub.net.br`
- Renovação automática habilitada (ACME/LB).
- Forçar HTTPS e redirecionar HTTP -> HTTPS.
- Conferir cadeia completa e ausência de certificado expirado/intermediário faltando.

## 7) Checklist Mercado Pago (Sandbox e Produção)

## HML (Sandbox)
- `MERCADO_PAGO_ACCESS_TOKEN` de teste (`TEST-...`).
- `MERCADO_PAGO_NOTIFICATION_URL` público e acessível:
  - `https://api-hml.menuhub.net.br/v2/payments/webhook/mercadopago`
- Confirmar criação PIX retorna `providerPaymentId`, `qrCodeText`, `expiresAt`.
- Validar transição de status por webhook e endpoint `/v2/payments/:providerPaymentId/status`.

## PRD (Produção)
- `MERCADO_PAGO_ACCESS_TOKEN` de produção (`APP_USR-...`).
- `MERCADO_PAGO_NOTIFICATION_URL`:
  - `https://api.menuhub.net.br/v2/payments/webhook/mercadopago`
- Validar credenciais em cofre/secret manager.
- Validar observabilidade (logs, erros 4xx/5xx do provider, timeout).

## 8) Smoke tests pós deploy

## Health/API básica
```bash
curl -i https://api-hml.menuhub.net.br/v2/modules \
  -H "x-company-id: company-demo" \
  -H "x-user-role: admin"
```

```bash
curl -i https://api.menuhub.net.br/v2/modules \
  -H "x-company-id: company-prod" \
  -H "x-user-role: admin"
```

## Checkout PIX HML
```bash
curl -i -X POST https://api-hml.menuhub.net.br/v2/channels/delivery/checkout \
  -H "Content-Type: application/json" \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: user" \
  -H "x-channel: delivery" \
  -d '{
    "storeId": "store-demo",
    "customer": { "name": "QA HML", "phone": "11999990000" },
    "deliveryAddress": {
      "cep": "01001000",
      "street": "Praça da Sé",
      "number": "100",
      "neighborhood": "Centro"
    },
    "items": [
      { "productId": "<PRODUCT_ID_VALIDO>", "quantity": 1 }
    ],
    "paymentMethod": "PIX"
  }'
```

Esperado:
- `payment.provider = mercadopago`
- `payment.providerPaymentId` preenchido
- `payment.qrCodeText` preenchido

## Status de pagamento
```bash
curl -i https://api-hml.menuhub.net.br/v2/payments/<PROVIDER_PAYMENT_ID>/status \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: user"
```

## Painel admin
- HML: abrir `https://app-hml.menuhub.net.br/admin/orders`
- PRD: abrir `https://admin.menuhub.net.br/admin/orders` (ou rota configurada do app admin)
- Confirmar listagem, atualização de status e conexão socket.

## 9) Checklist de rollback

- Possibilidade imediata de voltar `PAYMENT_PROVIDER=mock` em HML/PRD.
- Reaplicar última imagem estável da `api-v2`.
- Confirmar `/v2/channels/delivery/checkout` operacional após rollback.
