# MenuHub V2 — Plano Local Blocos 06 a 10

## Base de trabalho
- Fonte: `C:\MenuHubV2\Arquivo MD\MenuHubV2_Blocos_06_10_Codex\menuhub_blocos_06_10_codex`
- Escopo: Blocos 06, 07, 08, 09 e 10
- Regra: 100% local, sem servidor/HML/produção/deploy

## Estado atual antes de iniciar
- Branch atual: `main`
- Observação: existem mudanças locais pendentes em auth/module guard que precisam ser finalizadas (commit ou stash) antes de começar o Bloco 06 para manter rastreabilidade limpa por bloco.

## Ordem de execução recomendada
1. Bloco 06 — Empresas
2. Bloco 07 — Filiais
3. Bloco 08 — Usuários ADM
4. Bloco 09 — Settings / Configurações
5. Bloco 10 — Onboarding

## Estratégia por bloco
- Etapa A: Auditoria local (sem alterar código)
- Etapa B: Implementação incremental (diff mínimo)
- Etapa C: Testes negativos e validação
- Etapa D: Commit local do bloco (sem push/PR)

## Bloco 06 — Empresas
### Objetivo
Harden de cadastro/edição/status de empresa com isolamento tenant e proteção platform vs tenant.

### Entregas técnicas
- Validações de create/update company
- Rejeição de payload vazio em update
- Validação de status permitido
- Platform-only para criação/edição global
- Tenant só acessa própria company
- Audit event administrativo (se contrato do Bloco 05 já estiver aplicado no ponto)

### Testes obrigatórios
- Tenant A não acessa/edita company B
- Tenant admin não cria company global
- `platform:companies:create` cria
- `platform:companies:update` edita
- Payload inválido/status inválido retorna `BadRequest`

### Sugestão de commit
`feat(companies): harden company administration flows`

## Bloco 07 — Filiais
### Objetivo
Harden de branch com escopo `companyId`/`branchId`, status/horários e regras cross-company/cross-branch.

### Entregas técnicas
- Validações de create/update branch
- Rejeição de payload vazio em update
- Garantia de vínculo branch→company correta
- Bloqueio cross-company
- Respeito a branch-scoped user (quando regra já existir)
- Audit event administrativo (se aplicável)

### Testes obrigatórios
- Company admin cria/edita apenas na própria company
- Branch status inválido bloqueia
- Branch-scoped user bloqueado fora do escopo
- Platform pode cross-company nas rotas de platform

### Sugestão de commit
`feat(branches): harden branch administration flows`

## Bloco 08 — Usuários ADM
### Objetivo
Consolidar gestão tenant-only de usuários administrativos sem efeito global indevido.

### Entregas técnicas
- Validação de payload create/update usuário
- Validação de `roleKey` permitido
- Validação de `branchIds` da company
- `assignBranches` sem remover acessos de outra company
- Remoção tenant-only (membership/roles/branch access da company atual)
- Audit trail administrativo para ações sensíveis

### Testes obrigatórios
- Admin A não altera usuário de company B
- `assignBranches` não remove acesso de outra company
- `deleteUser` não faz soft-delete global
- Role global bloqueada fora de platform
- Perfis operacionais sem `admin.users.write` bloqueados

### Sugestão de commit
`feat(admin-users): harden tenant user administration`

## Bloco 09 — Settings / Configurações
### Objetivo
Padronizar RBAC e validações de settings por company/branch sem vazar dados privados.

### Entregas técnicas
- GET: `settings.read | settings.write`
- PATCH/PUT: `settings.write`
- Payload vazio bloqueado
- Taxas numéricas não negativas
- Validação de horários (quando aplicável)
- Validação conjunta `companyId + branchId` para branch settings
- Proteção de rota pública de delivery fee (singular) preservada
- Audit event para update sensível

### Testes obrigatórios
- `settings.read` lê, não escreve
- `settings.write` escreve
- Perfis operacionais bloqueados para escrita
- Cross-company/cross-branch bloqueados
- Payload vazio e taxa negativa bloqueiam

### Sugestão de commit
`feat(settings): harden company and branch settings`

## Bloco 10 — Onboarding
### Objetivo
Fluxo local mínimo e seguro de onboarding (empresa, filial, admin, plano, módulos e resumo final), platform-only.

### Entregas técnicas
- Endpoint/serviço de onboarding local (sem UI)
- Criação empresa + filial principal
- Criação/vínculo admin owner/manager conforme domínio atual
- Definição de plano/subscription inicial
- Habilitação de módulos conforme plano
- Resumo final: `companyId`, `branchId`, `adminUserId`, `subscriptionId`, `enabledModules`, `nextSteps`
- Transação para consistência, quando disponível no fluxo atual

### Testes obrigatórios
- `technical-admin` executa onboarding
- Tenant admin não executa onboarding global
- Payload mínimo válido cria estrutura
- Falta company/branch/admin/plan bloqueia
- Módulos seguem plano
- Falha intermediária não deixa estado inconsistente (se transação aplicada)

### Sugestão de commit
`feat(onboarding): add local company onboarding flow`

## Validação padrão em todos os blocos
```bash
git status --short
git branch --show-current
git log --oneline -10

node ./node_modules/typescript/bin/tsc -p apps/api-v2/tsconfig.json
node ./node_modules/jest/bin/jest.js --config apps/api-v2/jest.config.js --runInBand
```

Com `DATABASE_URL` disponível:
```bash
npx.cmd prisma validate --schema apps/api-v2/prisma/schema.prisma
npx.cmd prisma migrate status --schema apps/api-v2/prisma/schema.prisma
```

## O que não fazer agora
- Não abrir PR até fechar o bloco autorizado
- Não fazer push/merge
- Não usar `git add .` / `git add ..`
- Não criar migration sem autorização explícita
- Não rodar `db push` ou `migrate reset`
- Não misturar mudanças de dois blocos no mesmo commit

## Próximo passo imediato
1. Fechar o estado pendente atual do `main` (commit local ou stash)
2. Iniciar `Bloco 06A — Auditoria Local` com relatório
