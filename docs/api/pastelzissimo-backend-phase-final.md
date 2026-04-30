# Consolidado final da fase do backend

Este documento registra o fechamento tecnico desta fase do backend: o que foi encerrado, o que permanece em transicao deliberada e quais decisoes arquiteturais foram preservadas.

## 1. Objetivo da fase

Nesta rodada, o backend foi consolidado em torno de namespaces canonicos claros, com recortes de dominio congelados por runtime, policy de legado, testes e documentacao.

## 2. Modulos fechados nesta fase

- `delivery`
- bloco `public/orders`
- restante de `orders`
- `finance`
- `kitchen`
- `stock`
- `payments`
- `tables`
- `counter-orders`
- `purchasing`
- `production`

## 3. Estado tecnico final

- build do backend verde
- harness critico de contratos verde
- suites isoladas criadas para congelar os recortes auditados
- documentacao principal alinhada ao runtime atual
- `production` registrado como namespace proprio em `/api/v1/production/*`

## 4. Legado em transicao deliberada

As transicoes abaixo permanecem vivas por decisao explicita, nao como bug aberto:

- `orders/customer*` como historico de migracao para `customer/orders`, fora da policy ativa desta fase
- `checkout` como fachada/legado de transicao onde foi decidido
- `delivery-areas/*` como historico removido do runtime; `resolve-by-point` ja havia sido removido em corte anterior e o canonico publico continua em `public/delivery/coverage/coordinates`
- `couriers/*` e `deliveries/*` como historicos removidos do runtime; `delivery/couriers/*` e `delivery/deliveries/*` sao os contratos canonicos, e `checkout/orders*` segue como historico fora da policy ativa desta fase
- `financial` como alias legado para `finance`
- `inventory` como alias legado para `stock`
- `kds` como alias legado para `kitchen`
- `stock/waste-records` como alias legado para `stock/waste`
- `stock/variances` como alias legado para `stock/variance`
- `public/orders/:id/payment-intents` com convergencia parcial por decisao arquitetural
- `public/orders/quote` preservado em `orders-core`

## 5. Decisoes arquiteturais preservadas

- `public/orders` permanece dividido entre `checkout` e `orders-core` conforme definido nesta fase
- `payment-intents` segue com fachada publica em `checkout` e mutacao central em `orders`
- `quote` continua em `orders-core`
- `production` e namespace proprio, nao subbloco canonico de `stock`
- `tables` e `commands` continuam como contrato canonico de mesas/comandas
- `counter-orders` continua como namespace canonico proprio do fluxo de balcao/comandas
- `purchasing` continua como namespace canonico proprio do fluxo de compras/recebimento

## 6. Criterio de encerramento desta fase

Esta fase pode ser considerada encerrada porque:

- os modulos e recortes desta rodada foram auditados e congelados
- o runtime ficou coerente com os controllers canonicos
- a policy de legado ficou coerente com os aliases mantidos de proposito
- os testes de contrato e as suites isoladas estao verdes
- a documentacao principal foi alinhada ao estado atual do backend

## 7. O que fica para fases futuras

- remocao futura dos aliases legados quando a janela de transicao permitir
- eventual convergencia adicional de pontos explicitamente adiados
- limpeza futura de historico documental residual, se ainda fizer sentido

## 8. Fechamento

O backend foi fechado no escopo desta fase. O que segue vivo no repositorio e transicao deliberada, nao pendencia tecnica.
