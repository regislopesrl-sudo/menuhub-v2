# PDV Mobile Android

## Plataforma fechada nesta rodada

O PDV Mobile e entregue como PWA instalavel no Android.

- Rota inicial: `/waiter`
- Manifest: `/manifest.webmanifest`
- Service worker: `/sw.js`
- Icones: `/icons/pdv-icon-192.png` e `/icons/pdv-icon-512.png`
- Display: `standalone`
- Escopo: `/`

## Instalacao no Android

1. Publicar o frontend Next em HTTPS.
2. Abrir `https://<dominio>/waiter` no Chrome Android.
3. Usar "Instalar app" ou "Adicionar a tela inicial".
4. Abrir pelo icone "PDV Mobile".

## Permissoes minimas do garcom

O operador do PDV Mobile precisa de acesso a filial e, no minimo:

- `orders.view`
- `orders.create`
- `orders.update`
- `commands.view`
- `commands.open`
- `commands.add_item`
- `commands.close`

Rotas de mesa usadas pelo dashboard tambem passam por `orders.view` e fechamento completo por `orders.update`.

## PIN de operador

O login do PDV usa `POST /auth/waiter-pin-login`, com PIN armazenado em `waiter_pin_credentials`.
O PIN nao fica em texto puro: o sistema grava `pin_lookup_hash` para busca e `pin_hash` com bcrypt para validacao.

Gestao operacional:

- criar ou trocar PIN: `PATCH /users/:id/waiter-pin` com `{ "pin": "1234", "label": "Salao" }`
- desativar PIN: `PATCH /users/:id/waiter-pin` com `{ "isActive": false }`
- permissao necessaria: `users.update`
- consulta de usuario retorna apenas metadados do PIN, nunca o hash

O seed cria PINs de demonstracao para `atendente@exemplo.com`, `gerente@exemplo.com` e `admin@exemplo.com`.
Em producao, troque todos os PINs de seed antes do piloto e use PIN unico por operador.

## Checklist de publicacao HTTPS

Requisitos minimos para usar no salao:

1. Rodar migration do banco, incluindo `20260425170000_waiter_pin_credentials`.
2. Executar seed apenas em homologacao ou criar PINs reais via endpoint de usuario.
3. Publicar frontend e backend em HTTPS com certificado valido.
4. Configurar `NEXT_PUBLIC_API_URL` apontando para a API HTTPS.
5. Garantir que cookies/localStorage nao sejam limpos por politica do navegador corporativo.
6. Abrir `https://<dominio>/waiter` no Chrome Android e instalar o PWA.
7. Fazer smoke com um garcom real, uma mesa livre e um item com adicional obrigatorio.

## Offline

A fila offline cobre envio de itens para a cozinha enquanto a tela da mesa esta aberta.
Ao reconectar, a tela tenta reenviar a fila com chave idempotente estavel. Rascunhos continuam persistidos no aparelho.

Nao coberto nesta rodada:

- fila offline de fechamento com pagamento
- sincronizacao multi-dispositivo de rascunhos locais
- resolucao automatica de conflito quando outro operador altera a mesma mesa durante o offline

## Smoke operacional de piloto

Antes de liberar no salao, validar em Android fisico e tablet:

1. entrar por PIN de operador real
2. abrir mesa livre
3. adicionar produto simples
4. adicionar produto com adicional obrigatorio
5. adicionar variacao ou combo quando houver cadastro no cardapio
6. desligar a rede, enfileirar envio e religar a rede
7. confirmar que apenas um pedido chegou na cozinha/KDS
8. fechar a comanda
9. fechar e reabrir o PWA pelo icone instalado
10. confirmar que sessao e filial continuam corretas

## Android empacotado

Nao havia Capacitor, Cordova, React Native, Expo ou Flutter no projeto. O caminho seguro agora e PWA.
Para gerar APK/AAB depois, o proximo passo recomendado e adicionar Capacitor em uma branch propria:

1. instalar `@capacitor/core`, `@capacitor/cli` e `@capacitor/android`
2. configurar `capacitor.config.ts` apontando para o build web publicado/exportado
3. executar `npx cap add android`
4. validar permissao de rede, splash/icon e deep link `/waiter`
5. gerar APK/AAB via Android Studio ou Gradle

Esse passo deve ser feito depois de smoke/UAT do PWA, para evitar carregar uma stack nativa sem necessidade operacional imediata.
