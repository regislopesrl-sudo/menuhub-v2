# ADR 0001: Ownership de `public/orders`

Data: 2026-04-20

## Status

Aceito

## Contexto

O namespace público de pedidos carregou ambiguidade histórica entre `checkout` e `orders-core`. Isso aumentava o risco de handlers concorrentes, sobreposição de paths e ownership pouco claro para o contrato público.

O backend já possui testes que protegem a divisão atual e a política de depreciação de aliases legados. Esta decisão apenas formaliza o comportamento já praticado pelo código e pelos testes.

## Decisão

O ownership de `public/orders` fica assim definido:

- `PublicOrdersCheckoutController` é owner de:
  - `POST /api/v1/public/orders`
  - `GET /api/v1/public/orders/:id`
  - `POST /api/v1/public/orders/:id/payment-intents`
- `PublicOrdersQuoteController` é owner de:
  - `POST /api/v1/public/orders/quote`

Em termos práticos:

- o contrato público de criação, consulta e intents de pagamento de pedidos pertence ao controller de checkout;
- o endpoint de cotação pública pertence ao controller de orders-core;
- qualquer nova rota em `public/orders` exige decisão explícita de ownership antes de ser adicionada.

Nota de escopo do canal publico neste ciclo:

- `POST /api/v1/public/orders` atende apenas jornadas de cliente final no cardapio online;
- `TABLE` e `QR` nao pertencem a esse contrato publico nesta fase;
- `tableReference` e `qrReference` ficam fora do contrato do checkout publico;
- fluxos de mesa/comanda continuam no dominio interno/salao, nao no canal publico.

Decisao deste ciclo:

- `POST /api/v1/public/orders` foi convergido para o fluxo central de `orders`;
- `POST /api/v1/public/orders/:id/payment-intents` permanece sob ownership legitimo de `checkout` neste ciclo;
- `POST /api/v1/public/orders/quote` permanece sob ownership de `orders-core`;
- `public/checkout/quote` saiu da policy ativa desta fase;
- qualquer convergencia de `payment-intents` fica adiada para a proxima fase.

## Consequências

- Evitamos duplicidade de handlers no mesmo namespace.
- O contrato público passa a ter uma divisão clara entre `checkout` e `orders-core`.
- Novos caminhos em `public/orders` não devem ser adicionados por inércia; devem ser discutidos e protegidos por teste.
- Os testes de ownership e de colisão passam a ser a guarda operacional dessa decisão.

## Limites

- Não deve existir outro controller montando os mesmos `method + path` em `public/orders` sem revisão arquitetural explícita.
- Alias legados podem continuar existindo na policy de depreciação, mas não devem introduzir novos handlers concorrentes.
- Mudanças no namespace `public/orders` devem preservar a compatibilidade do contrato atual.

## Referências

- [apps/backend/src/contracts/public-orders-ownership.contract.spec.ts](../../apps/backend/src/contracts/public-orders-ownership.contract.spec.ts)
- [apps/backend/src/contracts/public-orders-namespace-collision.contract.spec.ts](../../apps/backend/src/contracts/public-orders-namespace-collision.contract.spec.ts)
- [apps/backend/src/checkout/public-orders-checkout.controller.ts](../../apps/backend/src/checkout/public-orders-checkout.controller.ts)
- [apps/backend/src/modules/orders-core/public-orders-quote.controller.ts](../../apps/backend/src/modules/orders-core/public-orders-quote.controller.ts)

## Notas

Este ADR não altera runtime, controllers, services ou guards. Ele apenas registra a decisão arquitetural já refletida pelos contratos automatizados.



