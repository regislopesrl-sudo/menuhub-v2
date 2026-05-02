# QA Checklist - Mercado Pago PIX Sandbox (V2)

Este checklist valida o fluxo PIX da V2 com `MercadoPagoPixProvider`, sem alterar V1.

## 1) Variáveis de ambiente

Configurar no ambiente da `api-v2`:

```env
PAYMENT_PROVIDER=mercadopago
MERCADO_PAGO_ACCESS_TOKEN=TEST-xxxxxxxx
MERCADO_PAGO_NOTIFICATION_URL=https://SEU_HOST_PUBLICO/v2/payments/webhook/mercadopago
MERCADO_PAGO_API_BASE_URL=https://api.mercadopago.com
MERCADO_PAGO_TIMEOUT_MS=10000
```

Configurar no ambiente da `web-v2`:

```env
NEXT_PUBLIC_API_V2_URL=http://localhost:3202
NEXT_PUBLIC_API_V2_WS_URL=http://localhost:3202
NEXT_PUBLIC_MOCK_COMPANY_ID=company-demo
NEXT_PUBLIC_MOCK_BRANCH_ID=branch-demo
```

## 2) Subir api-v2 e web-v2 em QA

Em dois terminais, na raiz do monorepo:

```bash
npm run start:dev --workspace @delivery-futuro/api-v2
```

```bash
npm run dev --workspace @delivery-futuro/web-v2
```

Abrir:
- Cliente delivery: `http://localhost:3000/delivery`
- Painel admin: `http://localhost:3000/admin/orders`

## 3) Criar pedido PIX pela /delivery

1. Acessar `/delivery`.
2. Adicionar itens ao carrinho.
3. Preencher cliente e endereço.
4. Selecionar pagamento `PIX`.
5. Finalizar pedido.

## 4) Verificações obrigatórias

## 4.1 qrCodeText retornou

No retorno visual da tela de sucesso em `/delivery`, validar:
- `Pagamento: PENDING` inicialmente.
- Exibição de `qrCodeText` (copia e cola PIX).
- Exibição de QR Code (quando disponível).

## 4.2 providerPaymentId foi salvo

Validar no retorno do checkout (Network do navegador) que `payment.providerPaymentId` veio preenchido.

Opcional via endpoint de status:

```bash
curl -X GET "http://localhost:3202/v2/payments/<PROVIDER_PAYMENT_ID>/status" \
  -H "x-company-id: company-demo" \
  -H "x-branch-id: branch-demo" \
  -H "x-user-role: user"
```

Esperado: retorno com `providerPaymentId`, `paymentStatus`, `orderStatus`, `orderId`, `orderNumber`.

## 4.3 polling está funcionando

Após checkout PIX pendente:
- Verificar no DevTools chamadas periódicas (a cada ~5s) para:
  - `GET /v2/payments/:providerPaymentId/status`
- Confirmar que para quando status finaliza (`PAID/APPROVED`, `DECLINED`, `EXPIRED`).

## 4.4 webhook atualiza pedido

Após disparo de webhook válido (manual/sandbox), validar:
- Status de pagamento muda no endpoint de status.
- Status do pedido muda conforme mapeamento implementado.

## 4.5 painel admin recebe status em tempo real

Com `/admin/orders` aberto:
- Confirmar atualização da lista quando pedido muda de status.
- Se detalhe estiver aberto, confirmar status atualizado.

## 5) Simular webhook sandbox (manual)

Exemplo (payload simplificado aceito pelo provider atual):

```bash
curl -X POST "http://localhost:3202/v2/payments/webhook/mercadopago" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt-manual-001",
    "type": "payment",
    "action": "payment.updated",
    "data": { "id": "<PROVIDER_PAYMENT_ID>" }
  }'
```

Observação:
- O backend consulta a API do Mercado Pago pelo `data.id` antes de atualizar pedido.

## 6) Troubleshooting

## 6.1 Token inválido

Sintoma:
- Erro ao criar PIX / webhook falha ao consultar pagamento.

Ação:
- Validar `MERCADO_PAGO_ACCESS_TOKEN` sandbox.
- Confirmar sem espaços extras e com prefixo correto do token de teste.

## 6.2 notification_url inacessível

Sintoma:
- Webhook não chega automaticamente do Mercado Pago.

Ação:
- Expor `api-v2` publicamente (ex.: túnel HTTPS).
- Atualizar `MERCADO_PAGO_NOTIFICATION_URL` com URL pública válida.

## 6.3 Webhook não chega

Sintoma:
- Pedido permanece pendente mesmo após ação no sandbox.

Ação:
- Verificar logs da `api-v2`.
- Testar webhook manual via `curl`.
- Confirmar rota `POST /v2/payments/webhook/mercadopago` acessível.

## 6.4 CORS/Socket

Sintoma:
- Painel/admin não atualiza em tempo real.

Ação:
- Verificar URL do socket em `NEXT_PUBLIC_API_V2_WS_URL`.
- Validar handshake com `x-company-id`/`branchId`.
- Validar queda de conexão no browser e fallback por refresh manual.

## 6.5 Pagamento fica PENDING

Sintoma:
- Nunca transiciona para status final.

Ação:
- Consultar status no endpoint `GET /v2/payments/:providerPaymentId/status`.
- Verificar se evento chegou (ou simular manual).
- Conferir se provider retornou status terminal no MP sandbox.

## 7) Riscos antes de PRD

- Assinatura/validação criptográfica de webhook ainda pendente.
- Idempotência de webhook ainda em memória (não persiste após restart).
- `providerPaymentId` ainda vinculado via `internalNotes` (sem coluna/index dedicado).
