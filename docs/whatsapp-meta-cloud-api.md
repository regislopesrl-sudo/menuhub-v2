# WhatsApp - Meta WhatsApp Cloud API

O modulo de WhatsApp usa a Meta WhatsApp Cloud API. Nao ha segundo provedor nem alias operacional: o backoffice consome o namespace canonico `whatsapp/conversations/*` e a Meta chama `webhook/whatsapp`.

## Variaveis obrigatorias

Backend:

```env
WHATSAPP_VERIFY_TOKEN=um_token_definido_por_voce_para_validar_o_webhook
WHATSAPP_PHONE_NUMBER_ID=id_do_numero_no_app_da_meta
WHATSAPP_TOKEN=token_de_acesso_da_meta_com_permissao_de_envio
WHATSAPP_TEMPLATE_LANGUAGE=pt_BR
```

Frontend:

```env
NEXT_PUBLIC_API_URL=https://seu-backend/api/v1
```

`WHATSAPP_TEMPLATE_LANGUAGE` e opcional; quando ausente, o backend usa `en_US` para templates.

## Ordem de configuracao

1. Preencha as variaveis do backend e reinicie a API.
2. Preencha `NEXT_PUBLIC_API_URL` no frontend apontando para o backend com `/api/v1`.
3. Rode o seed para criar as permissoes `whatsapp.view`, `whatsapp.reply`, `whatsapp.assign`, `whatsapp.pause_bot` e `whatsapp.resume_bot`.
4. Garanta que o usuario admin tenha role `ADMIN`/`SUPER_ADMIN` ou essas permissoes explicitas.
5. Publique o backend em HTTPS antes de configurar a Meta em producao.
6. Configure na Meta o webhook `GET/POST https://seu-backend/api/v1/webhook/whatsapp` usando o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.

## Primeiro teste recomendado

Valide o webhook:

```bash
curl "https://seu-backend/api/v1/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=ok"
```

A resposta esperada e o texto puro `ok`.

Depois, com token admin valido:

```bash
curl -H "Authorization: Bearer ADMIN_ACCESS_TOKEN" \
  -H "X-Branch-Id: BRANCH_ID" \
  "https://seu-backend/api/v1/whatsapp/conversations"
```

## Endpoints operacionais

- `GET /api/v1/whatsapp/conversations`: lista conversas. Requer `Authorization: Bearer <admin token>`, `X-Branch-Id` e `whatsapp.view`.
- `GET /api/v1/whatsapp/conversations/:id`: detalhe. Requer `whatsapp.view`.
- `POST /api/v1/whatsapp/conversations/:id/send-message`: envia texto/template. Body: `{ "content": "mensagem", "messageType": "text" }`. Requer `whatsapp.reply`.
- `POST /api/v1/whatsapp/conversations/:id/assign`: atribui responsavel. Body: `{ "userId": "uuid" }`. Requer `whatsapp.assign`.
- `POST /api/v1/whatsapp/conversations/:id/pause-bot`: pausa automacao. Requer `whatsapp.pause_bot`.
- `POST /api/v1/whatsapp/conversations/:id/resume-bot`: retoma automacao. Requer `whatsapp.resume_bot`.

## Observabilidade e erros

- `WHATSAPP_CONFIG_MISSING`: variavel obrigatoria ausente no backend.
- `WHATSAPP_PROVIDER_UNAVAILABLE`: falha de rede ao chamar a Meta.
- `WHATSAPP_PROVIDER_ERROR`: a Meta recusou a requisicao e o detalhe vem no payload.
- `401`: sessao admin ausente/expirada.
- `403`: usuario sem permissao para a acao.

## Ponto ainda pendente para endurecimento

O webhook valida `WHATSAPP_VERIFY_TOKEN` no `GET`, mas ainda nao valida assinatura `X-Hub-Signature-256` no `POST`. Para exigir assinatura da Meta, adicione `META_APP_SECRET` e valide o corpo bruto do request antes de processar eventos.
