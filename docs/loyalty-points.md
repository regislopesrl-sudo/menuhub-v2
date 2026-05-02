# Fidelidade por pontos

## Gatilho

O acumulo automatico usa `PAYMENT_CONFIRMED`: quando `payments.confirm` deixa o pedido com `paymentStatus = PAID`, o backend tenta gerar pontos uma unica vez para o pedido.

## Calculo de acumulo

Valor elegivel: `order.totalAmount` depois de descontos e taxas, porque e o valor validado pelo pagamento confirmado.

Formula: `points = eligibleAmount / earnBaseAmount * earnRate`, com arredondamento configuravel (`FLOOR`, `ROUND`, `CEIL`). A regra padrao e 1 ponto a cada R$ 1,00 usando `FLOOR`.

## Calculo de resgate

O checkout envia apenas a intencao de usar pontos. O backend valida saldo, regra e valor do pedido.

Formula padrao: `discount = points / pointsPerCurrencyUnit`. O desconto respeita minimo de pontos, maximo de pontos por pedido, maximo de desconto por pedido e nunca ultrapassa o valor do pedido.

## Integridade e duplicidade

O saldo fica em `loyalty_accounts`. O extrato fica em `loyalty_transactions` com `balanceBefore`, `balanceAfter`, `monetaryValue`, `reason`, `customerId` e `orderId`.

A migration cria indices parciais para impedir mais de um `EARN` e mais de um `REDEEM` por cliente/pedido. O servico tambem usa lock da conta (`FOR UPDATE`) antes de movimentar saldo.

## Reversao

Cancelamento chama reversao com motivo `ORDER_CANCELED`. Estorno total chama reversao com motivo `PAYMENT_REFUNDED`. A regra permite desligar as duas reversoes.

## Expiracao

A politica de expiracao e FIFO por transacao `EARN`.

Cada `EARN` passa a carregar:

- `availablePoints`: pontos ainda disponiveis naquele lote.
- `expiresAt`: data calculada por `expirationDays + gracePeriodDays`.

Resgate consome os lotes `EARN` mais antigos com `availablePoints > 0`, ignorando lotes ja expirados. A expiracao tambem atua apenas sobre `availablePoints > 0`, portanto nao expira pontos ja resgatados, revertidos ou expirados.

Configuracao:

- `expirationEnabled`
- `expirationDays`
- `expirationPolicy = FIFO_EARN`
- `gracePeriodDays`
- `expiryAlertWindowDays`

Quando um lote vence, o sistema cria uma transacao `EXPIRE` no extrato com `sourceTransactionId` apontando para o `EARN` original, `balanceBefore`, `balanceAfter`, `reason = FIFO_EARN_EXPIRATION` e pontos negativos. O lote original tem `availablePoints` zerado na mesma transacao de banco.

Execucao:

- automatica via `LoyaltyExpirationWorker`, seguindo o padrao local de workers com `setInterval`;
- configuravel por `LOYALTY_EXPIRATION_JOB_ENABLED`, `LOYALTY_EXPIRATION_INTERVAL_MS` e `LOYALTY_EXPIRATION_LIMIT`;
- manual via `POST /loyalty/expire`.

O alerta do admin usa `GET /loyalty/expiring-soon` e lista clientes, pontos, data prevista e lote `EARN` dentro da janela `expiryAlertWindowDays`.

## Superficies e avisos

Admin: a tela de fidelidade permite consultar saldo/extrato de cliente, editar regras de acumulo, resgate e expiracao, executar expiracao manual e ver a tabela de pontos prestes a expirar.

Checkout customer: o checkout consulta o backend para previa de resgate, mostra saldo/desconto e envia apenas a intencao de uso de pontos.

Customer: a rota `/pontos` mostra saldo, extrato auditavel, totais de pontos ganhos/usados/expirados, lotes prestes a expirar e avisos basicos derivados do ledger.

Notificacoes basicas: enquanto nao existe um centro dedicado de notificacoes de fidelidade, os avisos aparecem na superficie do cliente e no alerta administrativo. O endpoint do cliente retorna eventos de pontos ganhos, usados, expirados e prestes a expirar.

## Endpoints

- `GET /loyalty/rule`
- `PATCH /loyalty/rule`
- `GET /loyalty/customers/:id`
- `GET /loyalty/customer/me`
- `POST /loyalty/redeem`
- `POST /loyalty/checkout/redemption-preview`
- `GET /loyalty/expiring-soon`
- `POST /loyalty/expire`

## Limitacoes

Campanhas e niveis nao entraram nesta rodada. Reversao de resgate devolve saldo agregado, mas a restauracao exata por lote consumido pode ser refinada depois com uma tabela dedicada de alocacoes se o dominio exigir estornos granulares.
