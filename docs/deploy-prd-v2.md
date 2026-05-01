# Deploy PRD V2 (MenuHub)

Dominios PRD:
- `https://api.menuhub.net.br` -> `api-v2`
- `https://app.menuhub.net.br` -> `web-v2` (cliente)
- `https://admin.menuhub.net.br` -> `web-v2/admin/orders` (painel)

IP esperado DNS A:
- `157.180.123.181`

## 1) Arquivos

- `docker-compose.prd.yml`
- `nginx/menuhub-v2-prd.conf`
- `apps/api-v2/.env.prd.example`
- `apps/web-v2/.env.prd.example`

## 2) Preparacao

```bash
cp apps/api-v2/.env.prd.example apps/api-v2/.env.prd
cp apps/web-v2/.env.prd.example apps/web-v2/.env.prd
```

Ajustar segredos em `apps/api-v2/.env.prd`:
- `POSTGRES_PASSWORD`
- `MERCADO_PAGO_ACCESS_TOKEN`

## 3) Build e subida

```bash
docker compose -f docker-compose.prd.yml build
```

```bash
docker compose -f docker-compose.prd.yml up -d
```

## 4) Logs

```bash
docker compose -f docker-compose.prd.yml logs -f
```

## 5) Stop

```bash
docker compose -f docker-compose.prd.yml down
```

## 6) DNS e SSL checklist

DNS (A -> `157.180.123.181`):
- `api.menuhub.net.br`
- `app.menuhub.net.br`
- `admin.menuhub.net.br`

SSL:
- certificado valido para os 3 dominios
- renovar automatico ativo
- portas 80/443 abertas

## 7) Mercado Pago checklist

- `PAYMENT_PROVIDER=mercadopago`
- `MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...`
- `MERCADO_PAGO_NOTIFICATION_URL=https://api.menuhub.net.br/v2/payments/webhook/mercadopago`
- webhook publico acessivel

## 8) Smoke test

```bash
curl -i https://api.menuhub.net.br/v2/health
```

```bash
curl -i https://api.menuhub.net.br/v2/modules \
  -H "x-company-id: company-prod" \
  -H "x-user-role: admin"
```

```bash
curl -i https://api.menuhub.net.br/v2/orders?page=1&limit=20 \
  -H "x-company-id: company-prod" \
  -H "x-branch-id: branch-prod" \
  -H "x-user-role: admin"
```

Abrir:
- `https://app.menuhub.net.br/delivery`
- `https://admin.menuhub.net.br/admin/orders`
