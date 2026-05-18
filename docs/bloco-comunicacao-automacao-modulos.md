# Bloco Tecnico Transversal - Comunicacao e Automacao entre Modulos

## Objetivo

Garantir que o MenuHub V2 funcione como um sistema integrado, dinamico e automatizado, em vez de um conjunto de telas e modulos isolados.

Este bloco nao substitui os blocos funcionais. Ele amarra os efeitos entre eles:

- pedido criado
- pagamento aprovado
- pedido cancelado
- venda PDV concluida
- recebimento de compra
- baixa de estoque
- criacao de contas financeiras
- eventos de auditoria
- notificacoes/realtime
- status de modulo por plano/assinatura

## Escopo

Este e um bloco transversal local/prod-ready para validar e endurecer a comunicacao entre:

- Auth / Tenant / RBAC
- Developer / Platform
- Planos / Assinaturas / Modulos
- Catalogo / Cardapio
- Delivery / Checkout
- Orders / Timeline
- PDV / Caixa
- KDS / Cozinha
- Mesas / Comandas / App Garcom
- Totem / Kiosk
- Pagamentos mock/local
- Billing SaaS
- Estoque
- Ficha tecnica / Producao
- Compras / Fornecedores
- Financeiro
- Auditoria / Logs
- Realtime
- Observabilidade local

## Estado atual auditado

Auditoria local em `C:\MenuHubV2`:

- Branch: `main`
- Commit base: `a23e8c2`
- API TypeScript: OK
- API tests: OK, `76 suites / 599 tests`
- Web build: OK
- Working tree: limpa

### Pontos fortes atuais

- `AppModule` registra os principais modulos do backend.
- `AuthGuardV2` e `PermissionGuardV2` estao globais.
- `ModuleGuard` e `ModuleAccess` controlam modulos por plano/assinatura/override.
- `CheckoutService` conversa com menu, frete, pagamentos, pedidos, PDV e eventos.
- `OrdersService` conversa com timeline, realtime, KDS, pagamentos, estoque e auditoria.
- `ProcurementService` conversa com fornecedores, compras, recebimento, estoque, lote e contas a pagar.
- `BillingService` conversa com assinatura, faturas, eventos comerciais, webhook e historico.
- `StockService` cobre itens, lotes, movimentos, FEFO, inventario, perdas e alertas.
- `RecipesService` cobre ficha tecnica, composicao, custo, producao e perdas.
- `FinanceService` cobre ledger, contas a pagar, contas a receber, fluxo, DRE e reconciliacao.
- Web possui telas principais para admin, developer, delivery, catalogo, estoque, compras, producao, financeiro, PDV, KDS e mesas.

### Pontos ainda nao 100% automatizados

- Publisher de pedidos ainda e em memoria.
- Existem fluxos `mock` em pagamentos, reembolso e billing.
- Existem fallbacks controlados em frontend/backend.
- Auditoria administrativa ainda nao e persistida como trilha unica para todos os modulos.
- Nem todo evento de dominio gera efeito financeiro/estoque/auditoria de forma centralizada.
- Ainda nao existe diagnostico unico de saude entre modulos.
- Algumas integracoes futuras seguem preparatorias: fiscal real, PIX real, cartao real, WhatsApp real, marketplace e hardware.

## Matriz alvo de comunicacao

| Evento origem | Modulos afetados | Automatizacao alvo | Estado esperado |
| --- | --- | --- | --- |
| Login admin/tecnico | Auth, RBAC, Tenant, Audit | Registrar actor/contexto e permissoes efetivas | Dinamico |
| Empresa criada | Platform, Company, Billing, Modules, Onboarding, Audit | Criar dados minimos e trilha administrativa | Dinamico |
| Assinatura ativada | Billing, Modules, Admin UI, Audit | Liberar modulos conforme plano e overrides | Dinamico |
| Assinatura vencida/inadimplente | Billing, Modules, Admin UI, Delivery/PDV/KDS | Bloquear modulos sensiveis conforme regra | Dinamico |
| Plano alterado | Billing, Modules, Commercial History, Audit | Recalcular modulos/limites e registrar evento | Dinamico |
| Produto criado/alterado | Catalogo, Delivery, PDV, Kiosk, Waiter, Audit | Refletir em todos os canais habilitados | Dinamico |
| Ficha tecnica alterada | Recipes, Cost, Catalogo, Margem, Stock | Recalcular custo/margem do produto | Parcial |
| Pedido delivery criado | Delivery, Orders, Payments, KDS, Timeline, Realtime, Audit | Criar pedido, pagamento, timeline e evento realtime | Dinamico |
| Pedido PDV criado | PDV, Orders, Cash, Payments, KDS, Timeline, Audit | Vincular caixa, pagamento e pedido | Dinamico |
| Pedido mesa/comanda criado | Tables, Waiter, Orders, KDS, Timeline, Audit | Vincular mesa/comanda e cozinha | Dinamico/parcial |
| Pagamento aprovado | Payments, Orders, Finance, Timeline, Audit | Atualizar status, recebivel e evento | Parcial |
| Pedido cancelado | Orders, Payments, Stock, Finance, Timeline, Audit | Reverter/ajustar impactos quando aplicavel | Parcial |
| Pedido concluido | Orders, Stock, Recipes, Finance, BI, Audit | Baixa automatica por venda e lancamentos | Parcial |
| Recebimento de compra | Procurement, Stock, Batch/FEFO, Finance, Audit | Entrada de estoque, lote e contas a pagar | Dinamico |
| Perda/quebra registrada | Stock, Finance, BI, Audit | Movimento, custo e relatorio | Dinamico/parcial |
| Producao finalizada | Recipes, Stock, Cost, Audit | Consumo/producao e custo | Dinamico/parcial |
| Caixa fechado | PDV, Finance, Audit | Criar divergencia, ledger e reconciliacao | Parcial |
| Webhook recebido | Payments/Billing, Orders/Invoices, Audit | Idempotencia, retry e status | Dinamico/mock |
| Evento realtime | Orders, KDS, Delivery tracking, Admin UI | Notificar telas conectadas | Dinamico/in-memory |

## Principios deste bloco

1. Nao duplicar regra de negocio em controllers.
2. Todo efeito entre modulos deve ser explicito, testavel e auditavel.
3. Nenhum modulo deve depender de header falso como autoridade.
4. Fallback local pode existir, mas deve ser visivel e isolado.
5. Mock e gateway real devem compartilhar contrato, nao regra duplicada.
6. Fluxos criticos devem ser idempotentes.
7. Eventos nao devem quebrar a acao principal quando forem nao bloqueantes.
8. Eventos bloqueantes devem ter rollback/transacao clara.
9. Toda automacao financeira/estoque deve ter origem rastreavel.
10. O frontend deve consumir API real sempre que a feature estiver marcada como finalizada.

## Fases recomendadas

### Fase A - Mapa e contrato de eventos internos

Criar um catalogo central de eventos internos:

- `order.created`
- `order.status.updated`
- `order.cancelled`
- `order.refunded`
- `payment.approved`
- `payment.failed`
- `invoice.paid`
- `subscription.status.changed`
- `stock.entry.created`
- `stock.exit.created`
- `purchase.received`
- `cash.session.closed`
- `production.finished`

Entregas:

- contrato TypeScript dos eventos
- severidade/criticidade
- payload minimo
- origem/destino
- idempotency key recomendada
- testes unitarios

### Fase B - Event bus local e outbox futura

Padronizar um barramento local sem integrar servico externo ainda.

Entregas:

- interface `DomainEventBus`
- publisher local
- subscribers por modulo
- outbox model/documentado se ja existir estrutura
- testes de evento nao bloqueante
- testes de erro em subscriber

### Fase C - Automacoes criticas entre modulos

Priorizar:

1. `order.created -> timeline -> realtime -> audit`
2. `payment.approved -> order payment status -> finance receivable`
3. `order.completed -> stock auto consumption -> cost/margin`
4. `purchase.received -> stock batches -> accounts payable`
5. `cash.session.closed -> finance ledger/reconciliation`
6. `subscription.status.changed -> module access recalculation`

Entregas:

- subscribers pequenos
- transacoes claras nos fluxos bloqueantes
- auditoria sanitizada
- testes negativos e idempotencia

### Fase D - Diagnostico local de comunicacao

Criar uma forma local de confirmar que os modulos estao se comunicando.

Possiveis entregas:

- endpoint admin/technical de diagnostico local
- pagina tecnica opcional
- checklist automatizado
- health por modulo
- status de dependencias internas

### Fase E - Remocao controlada de mocks/fallbacks em fluxos finalizados

Nao remover mocks de uma vez.

Classificar:

- mock permitido em local
- fallback seguro
- fallback proibido em producao
- feature futura

Entregas:

- matriz de mocks/fallbacks
- guardrails por `APP_ENV`
- mensagens claras no frontend
- testes para impedir mock indevido em ambiente production-like

## Arquivos provaveis

Backend:

- `apps/api-v2/src/common/domain-events/*`
- `apps/api-v2/src/orders/*`
- `apps/api-v2/src/payments/*`
- `apps/api-v2/src/billing/*`
- `apps/api-v2/src/stock/*`
- `apps/api-v2/src/recipes/*`
- `apps/api-v2/src/procurement/*`
- `apps/api-v2/src/finance/*`
- `apps/api-v2/src/modules/*`
- `apps/api-v2/src/common/audit-log*`

Frontend:

- `apps/web-v2/src/app/admin/context/page.tsx`
- `apps/web-v2/src/app/admin/page.tsx`
- `apps/web-v2/src/features/modules/*`
- `apps/web-v2/src/features/orders/*`
- `apps/web-v2/src/features/stock/*`
- `apps/web-v2/src/features/finance/*`

Documentacao:

- `docs/bloco-comunicacao-automacao-modulos.md`
- `docs/api/backend-contract-pr-checklist.md`

## Testes necessarios

- evento publicado com payload minimo correto
- subscriber nao bloqueante nao quebra acao principal
- subscriber bloqueante falha com erro claro
- pagamento aprovado atualiza pedido e financeiro
- pedido concluido gera baixa de estoque quando ha composicao
- recebimento de compra gera lote, movimento e conta a pagar
- fechamento de caixa gera auditoria e lancamento financeiro quando aplicavel
- assinatura inativa bloqueia modulo
- assinatura ativa libera modulo do plano
- mock/fallback bloqueado em production-like
- realtime recebe evento de pedido

## Criterios de aceite

O bloco sera considerado pronto quando:

- existir mapa central dos eventos internos
- fluxos criticos tiverem eventos ou automacoes explicitas
- efeitos entre modulos estiverem cobertos por testes
- mocks/fallbacks estiverem classificados
- nenhuma feature finalizada depender de mock oculto
- erros entre modulos forem observaveis
- auditoria registrar acoes criticas sem dados sensiveis
- API e Web continuarem com build/test OK

## O que nao fazer neste bloco

- nao integrar gateway real de pagamento
- nao integrar WhatsApp real
- nao integrar fiscal real
- nao criar infraestrutura externa
- nao criar fila externa obrigatoria
- nao alterar regra comercial sem decisao explicita
- nao trocar arquitetura inteira do backend
- nao remover mocks que ainda sustentam testes locais
- nao mexer em servidor/HML/PRD

## Prioridade recomendada

1. Fase A - contrato de eventos
2. Fase C - automacoes pedido/pagamento/estoque/financeiro
3. Fase D - diagnostico local
4. Fase B - outbox/event bus robusto
5. Fase E - limpeza de mocks/fallbacks

## Recomendacao de PR

Criar uma PR pequena inicial:

`feat(platform): add module communication contract`

Escopo da primeira PR:

- contrato de eventos internos
- testes unitarios do contrato
- documentacao da matriz de comunicacao
- sem alterar fluxos de negocio ainda

Depois abrir PRs menores por fluxo:

- `feat(orders): automate payment to finance flow`
- `feat(stock): automate recipe stock consumption`
- `feat(procurement): harden purchase receipt automation`
- `feat(realtime): add durable event diagnostics`
