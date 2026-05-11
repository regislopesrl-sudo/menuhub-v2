# Bloco 19 — Totem / Autoatendimento

## Objetivo
Implementar canal próprio de autoatendimento local (`kiosk`) separado de PDV/Delivery/App Garçom.

## Escopo desta etapa
- Rota dedicada de checkout `kiosk` no backend.
- Contexto público/local controlado por `companyId/branchId` (sem JWT administrativo).
- Pedido persistido com `channel = KIOSK` e `orderType = KIOSK`.
- Integração com fluxo atual de pedidos/pagamento mock/KDS.

## Regras
- Sem deploy/servidor/HML/produção.
- Sem gateway real.
- Backend recalcula preços e valida itens.
- Não expor dados sensíveis administrativos.

## Critérios de aceite
- Checkout `kiosk` cria pedido válido.
- Pedido aparece no fluxo operacional correto.
- Sem regressão em checkout `delivery` e `pdv`.

