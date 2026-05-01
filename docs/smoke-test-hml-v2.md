# Smoke Test HML - V2

Este documento descreve o smoke test executável da V2 em homologação.

- API HML: `https://api-hml.menuhub.net.br`
- WEB HML: `https://app-hml.menuhub.net.br`
- Painel admin HML: `https://app-hml.menuhub.net.br/admin/orders`
- IP real do servidor: `157.180.123.181`

## Checklist DNS (HML/PRD)

- `api-hml.menuhub.net.br A 157.180.123.181`
- `app-hml.menuhub.net.br A 157.180.123.181`
- `api.menuhub.net.br A 157.180.123.181`
- `app.menuhub.net.br A 157.180.123.181`
- `admin.menuhub.net.br A 157.180.123.181`

## Arquivo de script

- `scripts/smoke-test-hml-v2.ps1`

## Pré-requisitos

- PowerShell 5+ ou PowerShell 7+
- API HML online
- Um `ProductId` válido da empresa para checkout
- Headers/contexto válidos:
  - `x-company-id`
  - `x-branch-id` (opcional)
  - `x-user-role=admin`
  - `x-channel=delivery`

## Exemplo de execução

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test-hml-v2.ps1 `
  -ApiBase "https://api-hml.menuhub.net.br" `
  -CompanyId "company-demo" `
  -BranchId "branch-demo" `
  -ProductId "SEU_PRODUCT_ID" `
  -Cep "01001000" `
  -Number "100"
```

## Parâmetros do script

- `ApiBase` (default: `https://api-hml.menuhub.net.br`)
- `CompanyId` (obrigatório)
- `BranchId` (opcional)
- `ProductId` (obrigatório)
- `Cep` (default: `01001000`)
- `Number` (default: `100`)

## Checklist automático (script)

O script executa na ordem:

1. `GET /v2/health`
2. `GET /v2/modules`
3. `GET /v2/menu`
4. `POST /v2/checkout/quote`
5. `POST /v2/channels/delivery/checkout` com `paymentMethod=PIX`
6. `GET /v2/payments/:providerPaymentId/status`
7. `GET /v2/orders`
8. `GET /v2/orders/:id`
9. `PATCH /v2/orders/:id/status` (para `CONFIRMED`)
10. Instrução para validação manual do painel admin

## Checklist manual (navegador)

Abrir `https://app-hml.menuhub.net.br/admin/orders` e validar:

- pedido recém-criado aparece na listagem
- status inicial do pedido está coerente
- após PATCH, status atualizado aparece
- erros de conexão/socket não bloqueiam a visualização
- home sai de `API Verificando` para `API Online`
- badge de WebSocket fica `Conectado`

### Validação de assets Next (obrigatória)

1. Abrir `https://app-hml.menuhub.net.br` e capturar o HTML.
2. Confirmar que pelo menos um arquivo CSS de `/_next/static/css` retorna `200`.
3. Confirmar que pelo menos um chunk JS referenciado no HTML (`/_next/static/chunks/...`) retorna `200`.
4. Se houver `404` em `/_next/static`, revisar proxy Nginx do HML para `/_next/` e `/_next/static/`.

## Saída esperada

- resumo final com `[PASS]` para todos os itens
- código de saída `0` quando sucesso
- código de saída `1` quando houver falhas

## Erros comuns e ações

- `401/403`:
  - validar `x-company-id` e `x-user-role`
  - validar módulo habilitado para a empresa

- `404` no checkout/menu:
  - `ProductId` inválido ou não pertence à empresa/filial

- `400` no checkout quote:
  - CEP/número inválidos ou endereço fora da área

- `providerPaymentId ausente`:
  - provider de pagamento não retornou payload PIX completo
  - verificar `PAYMENT_PROVIDER` e configuração do provider

- pagamento travado em `PENDING`:
  - webhook não chegou
  - `MERCADO_PAGO_NOTIFICATION_URL` inacessível
  - validar endpoint `POST /v2/payments/webhook/mercadopago`

- falha de CORS/socket no painel:
  - validar `CORS_ORIGIN` e `SOCKET_CORS_ORIGIN` na `api-v2`
  - conferir URL da API usada pelo frontend em HML

## Observação

Este smoke test não altera lógica de aplicação e não toca V1.
