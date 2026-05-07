# Bloco 05 - Auditoria / Logs (Status Local)

## Escopo
- Ambiente 100% local.
- Sem servidor/HML/producao/deploy.
- Sem alteracao de schema/migrations.

## Sub-blocos concluidos
- `05B` - contrato e policy de audit log.
- `05C` - aplicacao incremental nas rotas criticas (Developer, Billing, Admin Users, Settings).
- `05D` - testes negativos e integridade da trilha.

## Commits locais do Bloco 05
- `49d8832` feat(audit): add audit log contract and sanitization policy
- `1b91c3a` feat(audit): apply audit trail on critical platform routes
- `51aa9c5` test(audit): cover blocked outcomes and trail integrity

## Base tecnica implementada
- Contrato central em `common/audit-log.ts`:
  - action, severity, outcome, actor, scope, target, metadata, occurredAt.
- Sanitizacao recursiva de metadata com mascara `[REDACTED]`.
- Recorder central em `common/audit-log-recorder.ts`.
- Integracao incremental em controllers criticos:
  - `developer.controller.ts`
  - `billing.controller.ts`
  - `admin-users.controller.ts`
  - `settings.controller.ts`

## Regras de outcome cobertas
- `success`: operacao concluida com sucesso.
- `failure`: erro de regra/negocio/validacao.
- `blocked`: bloqueio por permissao/acesso (ex.: Forbidden).

## Integridade da trilha (cobertura)
- Actor derivado de `RequestContext` (incluindo `technical-admin`).
- Scope com `companyId`, `branchId`, `requestId` quando disponiveis.
- Target consistente por recurso (plan, company, subscription, invoice, settings, admin_user).
- Metadata sanitizada antes do log.

## Testes adicionados/ajustados
- `common/audit-log.spec.ts`
- `common/audit-log-recorder.spec.ts`
- `developer/developer.controller.spec.ts`
- `billing/billing.controller.spec.ts`
- `admin-users/admin-users.controller.spec.ts`
- `settings/settings.controller.spec.ts`

## Validacoes locais
- TypeScript API: OK
- Jest API: OK (`57 suites / 348 tests`)

## Fora de escopo (neste bloco)
- Persistencia unificada em tabela `AuditLog`.
- Instrumentacao completa de Orders/PDV/KDS.
- Integracoes externas de observabilidade.

## Proximo passo sugerido
- Abrir PR unica do Bloco 05 com os 3 commits locais.
- Em bloco futuro:
  - persistencia administrativa unificada (sem misturar timeline/webhook),
  - consulta/relatorio de eventos auditaveis por `companyId/requestId/action`.

