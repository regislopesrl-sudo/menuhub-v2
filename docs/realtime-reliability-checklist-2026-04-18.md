# Realtime Reliability Checklist (2026-04-18)

## Escopo validado
- Connect websocket autenticado
- Subscribe por filial (`scope=branch`)
- Subscribe por pedido (`scope=order`)
- Queda/reconexao com replay por `lastEventId`
- ACK de entrega
- Persistencia outbox/delivery
- Auth expirada/token invalido
- Retry/dead-letter da outbox
- Fallback polling no frontend (evidencia de implementacao)

## Evidencias executadas

### 1) Smoke realtime oficial (branch + replay + ack)
- Comando:
  - `npm run smoke:realtime --workspace @delivery-futuro/backend`
- Resultado:
  - `ok: true`
  - conexao 1 e 2 estabelecidas (`realtime.connected`)
  - replay concluido (`realtime.replay_complete`, `count: 1`)
  - eventos outbox publicados com status `PUBLISHED`
  - entregas registradas e `ackedAt` preenchido

### 2) Smoke order room explicito (scope order)
- Comando:
  - script inline Node executado em `apps/backend` (socket client + enqueue outbox `order.updated` com room `order_<id>`)
- Resultado:
  - `ok: true`
  - subscribe por pedido confirmado
  - evento recebido com `receivedEventId == eventId` e `receivedType: order.updated`

### 3) Auth expirada/token invalido
- Comando:
  - script inline Node executado em `apps/backend` com token invalido
- Resultado:
  - `ok: true`
  - evento `auth.expired` recebido
  - payload: `"Invalid realtime token"`
  - observacao: handshake pode emitir `connect` antes do `auth.expired`, comportamento consistente com o gateway atual

### 4) Retry/dead-letter da outbox
- Comando:
  - `npm run test --workspace @delivery-futuro/backend -- realtime-outbox.service.spec.ts`
- Resultado:
  - `PASS src/realtime/realtime-outbox.service.spec.ts`
  - cobertura de:
    - evento atingindo max retries e indo para backlog dead-letter
    - lease apenas de eventos elegiveis (`PENDING`/`FAILED` sob limite)

## Ajustes aplicados durante o fechamento

### Frontend websocket token resolution
- Arquivo:
  - `apps/frontend/src/lib/websocket/realtime-client.ts`
- Ajuste:
  - leitura de token passou a considerar chaves reais de sessao (`accessToken`, `customerAccessToken`) alem das legadas

### Frontend KDS fallback payload normalization
- Arquivo:
  - `apps/frontend/src/hooks/use-kds-socket.ts`
- Ajuste:
  - parsing robusto para respostas envelopadas (`data/items/orders`) no refresh de polling

### Frontend PDV realtime hook migrado para manager canonico
- Arquivo:
  - `apps/frontend/src/hooks/use-pdv-order-realtime.ts`
- Ajuste:
  - removeu socket legado direto
  - passou a usar `createRealtimeSocketManager` (auth/reconnect/resume/ack)
  - parsing de payload aceitando envelope novo e formatos legados
  - subscribe/unsubscribe por `scope=order`

## Pendencias residuais
- Validar esses mesmos cenarios no ambiente de producao/staging com Redis cluster habilitado e mais de 1 instancia backend (fan-out inter-node).
- Registrar metrica de SLA de replay (latencia media e p95) para acompanhamento continuo.
