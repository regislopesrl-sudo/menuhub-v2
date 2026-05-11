# Bloco 20 — App Garçom / Atendimento de Mesa

## Objetivo
Implementar canal autenticado operacional de salão (`waiter_app`) separado de PDV e Delivery.

## Escopo desta etapa
- Rota dedicada `waiter/checkout` no backend.
- Permissão obrigatória `waiter.operate`.
- Pedido persistido com `channel = WAITER_APP` e tipo de ordem de salão.
- Integração com fluxo atual de pedidos e KDS.

## Regras
- Sem deploy/servidor/HML/produção.
- Sem app nativo Android nesta etapa.
- Sem mudanças de schema/migration.

## Critérios de aceite
- Usuário com `waiter.operate` consegue criar pedido de salão.
- Usuário sem permissão é bloqueado.
- Fluxo de PDV continua intacto.

