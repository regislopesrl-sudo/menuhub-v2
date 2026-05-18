# PR - Bloco 300 - Prisma / Database Architecture Premium

## Resumo

Esta PR consolida o Bloco 300 do MenuHub V2, preparando a base Prisma/PostgreSQL e o backend para os modulos premium de food service.

O foco principal foi criar uma fundacao segura para:

- auditoria operacional;
- estoque premium;
- compras e fornecedores premium;
- ficha tecnica por produto;
- financeiro operacional de loja;
- BI e importacoes historicas;
- seeds e permissoes RBAC premium;
- query safety no backend.

## Escopo

- Schema Prisma modular e migrations controladas.
- Indices e idempotencia para pontos sensiveis.
- Seeds locais idempotentes para permissoes e roles premium.
- Prisma Client validado e gerado.
- Services backend foundation com filtros por empresa/filial.
- Testes negativos para tenant, filial, permissao, custo e financeiro.
- Documentacao final de PR, checklist HML futuro e rollback local.

## Sub-blocos executados

### 300A

Auditoria inicial do schema, migrations, seeds e uso do Prisma.

### 300B

Blueprint da arquitetura premium do banco.

### 300B-FIX1

Correcao do teste do `DeliveryController` com as dependencias atuais.

### 300B-FIX2

Saneamento controlado do historico de migrations no DEV.

### 300B-FIX3B

`migrate resolve` controlado no DEV para limpar historico Prisma sem `db push` e sem `migrate reset`.

### 300C-1

AuditLog foundation.

### 300C-2

Estoque premium foundation.

### 300C-3

Compras e fornecedores premium foundation.

### 300C-4

Ficha tecnica premium vinculada ao produto.

### 300C-5

Financeiro food service premium, usando estrutura real em `08_finance.prisma`.

### 300C-6

BI e importacoes historicas foundation.

### 300C-7

Indices e idempotencia final.

### 300D

Seeds premium idempotentes, Prisma Client e validacoes completas.

### 300E

Backend foundation com query safety, audit log minimo, RBAC, custo e financeiro protegidos.

### 300F

QA final, auditorias, documentacao de PR, checklist HML futuro e rollback local.

## Models adicionados/alterados

- `AuditLog`
- `InventoryItemCategory`
- `InventoryItem`
- `InventoryStockBalance`
- `InventoryMovement`
- `InventoryCount`
- `InventoryCountItem`
- `AverageCostHistory`
- `PurchaseReceipt`
- `PurchaseReceiptItem`
- `PurchaseQuote`
- `PurchaseConference`
- `PurchaseConferenceItem`
- `ProductRecipe`
- `ProductRecipeItem`
- `ProductRecipeCostSnapshot`
- `BranchSalesImport`
- `BranchSalesImportRow`
- `ImportedSalesHistory`
- `ReportSnapshot`
- `MetricSnapshot`

Financeiro premium ficou concentrado em `08_finance.prisma`, com models operacionais como categorias financeiras, contas, contas a pagar/receber, ledger, snapshots de DRE/CMV/fluxo e conciliacao.

## Migrations adicionadas

- `20260517180700_300c_1_audit_log_foundation`
- `20260517184500_300c_2_inventory_premium_foundation`
- `20260517221638_300c_3_purchases_premium_foundation`
- `20260517223224_300c_4_product_recipe_foundation`
- `20260517225832_300c_6_bi_imports_foundation`
- `20260517232324_300c_7_indexes_idempotency_foundation`

Tambem faz parte do diff a migration previa:

- `20260515100000_finance_premium_food_service`

## Seeds e permissoes

O seed local foi ampliado para permissoes premium e roles de empresa.

Permissoes premium auditadas:

- `inventory.*`
- `purchases.*`
- `suppliers.*`
- `recipe.*`
- `finance.*`
- `accounts_payable.*`
- `accounts_receivable.*`
- `reports.*`
- `audit.*`

Contagens no DEV apos o 300F:

- `permissions`: 66
- `company_permissions`: 66
- `company_roles`: 5
- `company_role_permissions`: 109

## Backend e query safety

Foram adicionados helpers e services foundation para evitar consultas tenant-scoped inseguras.

Principais protecoes:

- `companyId` obrigatorio em consultas tenant-scoped.
- `branchId`/`allowedBranchIds` em consultas por filial.
- bloqueio de filial fora do escopo.
- visibilidade de custo separada.
- visibilidade financeira separada.
- audit log minimo gravando no banco sem derrubar fluxo de negocio.

## Testes adicionados/ajustados

Foram adicionados testes de:

- query scope;
- audit log service;
- inventory backend foundation;
- purchases backend foundation;
- product recipes backend foundation;
- finance backend foundation;
- BI/imports backend foundation.

## Validacoes executadas

Executado no DEV:

- Prisma validate: OK
- Prisma generate: OK
- Prisma migrate status: OK
- TypeScript API: OK
- Jest API: OK, 84 suites / 670 testes
- Health API DEV: OK

## O que NAO foi feito

- Nao houve deploy.
- Nao houve HML.
- Nao houve producao.
- Nao houve push.
- Nao houve abertura de PR.
- Nao foi rodado `db push`.
- Nao foi rodado `migrate reset`.
- Nao houve edicao destrutiva de migrations antigas.
- Nao houve migracao de dados antigos para estruturas premium.
- Nao houve integracao fiscal real neste bloco.

## Riscos restantes

- O diff do branch e amplo e inclui alteracoes de UI/backend feitas em blocos anteriores ao 300F.
- Estruturas antigas e premium coexistem por decisao tecnica.
- Algumas ligacoes fortes por FK foram adiadas para reduzir risco inicial.
- HML precisa de backup e checklist proprio antes de qualquer aplicacao.

## Checklist para HML futuro

Ver `CHECKLIST_HML_BLOCO_300.md`.

## Rollback local

Ver `ROLLBACK_LOCAL_BLOCO_300.md`.

## Conclusao

QA final do Bloco 300 ficou verde no DEV.

Status recomendado:

- PR pronta localmente.
- Aguardando autorizacao explicita para push e abertura no GitHub.
