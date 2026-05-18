# CHECKLIST_HML_BLOCO_300

## Pre-requisitos

- Autorizar explicitamente aplicacao em HML.
- Confirmar branch final a ser enviado.
- Confirmar que o PR foi revisado.
- Confirmar que o HML aponta para o banco correto, nunca DEV ou PRD.
- Confirmar janela de manutencao se houver impacto operacional.

## Backup HML obrigatorio

Antes de qualquer migration em HML:

```bash
docker exec menuhub-postgres-v2-hml pg_dump -U postgres -d <BANCO_HML> --format=custom --file=/tmp/menuhub_hml_before_bloco_300.dump
docker cp menuhub-postgres-v2-hml:/tmp/menuhub_hml_before_bloco_300.dump ./backups/menuhub_hml_before_bloco_300.dump
ls -lh ./backups/menuhub_hml_before_bloco_300.dump
```

## Variaveis de ambiente

Confirmar:

- `DATABASE_URL` de HML.
- `NODE_ENV`.
- URLs de API/Web HML.
- secrets ja existentes no servidor, sem imprimir valores.
- variaveis de provider fiscal ou financeiro, se usadas.

## Ordem de deploy segura

1. Backup HML.
2. Pull/push da branch autorizada.
3. Instalar dependencias se necessario.
4. Prisma validate.
5. Prisma migrate status.
6. Prisma migrate deploy.
7. Prisma generate.
8. Seed controlado, somente se aprovado.
9. Build API/Web.
10. Restart de containers HML.
11. Health checks.
12. Testes funcionais de leitura.

## Comandos de validacao HML

Adaptar caminhos ao HML:

```bash
npm run prisma:validate --workspace @delivery-futuro/api-v2
npm run prisma:migrate:status --workspace @delivery-futuro/api-v2
npm run prisma:generate --workspace @delivery-futuro/api-v2
node ./node_modules/typescript/bin/tsc -p apps/api-v2/tsconfig.json
node ./node_modules/jest/bin/jest.js --config apps/api-v2/jest.config.js --runInBand
```

## Verificacao de migrations

- Sem migration aberta em `_prisma_migrations`.
- Sem migration pendente.
- Sem `migrate reset`.
- Sem `db push`.
- Migrations 300C presentes.
- 300D/300E sem migrations novas.

## Verificacao de seeds

- Permissoes premium existem.
- Company permissions sincronizadas.
- Roles premium existem.
- Seed idempotente: rodar duas vezes nao muda contagens inesperadamente.

## Verificacao de endpoints

Validar:

- `GET /v2/health`
- login admin
- catalogo
- estoque
- compras
- ficha tecnica
- financeiro
- relatorios

## Verificacao de logs

- API sem erro de Prisma.
- API sem erro de permissao indevida.
- Containers saudaveis.
- Sem erro de migration.

## Plano de rollback

- Parar aplicacao HML se necessario.
- Restaurar dump HML em banco controlado.
- Voltar branch/container anterior.
- Validar health e login.

## Criterios de GO/NO-GO

GO:

- backup criado;
- migrations OK;
- Prisma validate/generate OK;
- build OK;
- health OK;
- login e telas criticas OK.

NO-GO:

- backup falhou;
- migration pendente/falhada;
- segredo exposto;
- erro de Prisma;
- erro em endpoint critico;
- qualquer risco de atingir PRD.
