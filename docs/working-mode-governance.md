# MenuHub V2 - Governanca Oficial de Execucao (Local + Prod-Ready por Blocos)

## 1) Proposito
Este documento oficializa como o MenuHub V2 deve evoluir daqui em diante.

Objetivo central:
- concluir o sistema por blocos independentes;
- garantir qualidade prod-ready local em cada bloco;
- manter rastreabilidade via PR por bloco.

## 2) Escopo e limites
### Obrigatorio
- Trabalho 100% local.
- `main` como fonte oficial do produto.
- Evolucao por bloco com fechamento completo.
- Registro de decisoes tecnicas e validacoes por PR.

### Proibido neste ciclo
- Deploy em qualquer ambiente.
- Mudancas em servidor/HML/PRD.
- Aplicar patches legados automaticamente.
- Mesclar branches paralelas antigas sem auditoria formal.
- `prisma db push`.
- `prisma migrate reset`.
- Alterar migrations antigas.

## 3) Catalogo oficial de blocos
- Base: blocos 01 a 102.
- Complementares obrigatorios:
  - 103 - App Garcom (produto completo)
  - 104 - Totem Autoatendimento (produto completo)

Regra: os 104 blocos devem ser fechados com nivel prod-ready local.

## 4) Principios tecnicos obrigatorios
1. Seguranca primeiro
- Auth V2 + Bearer token como autoridade.
- RequestContext como fonte de company/branch.
- Nunca usar `x-user-role`/`x-company-id` como autoridade em producao.

2. Multi-tenant forte
- Isolamento entre empresas como regra nao negociavel.
- Testes negativos de acesso cruzado obrigatorios.

3. RBAC explicito
- Permissoes por rota/acao.
- Perfis operacionais bloqueados em rotas sensiveis.

4. Evolucao segura de banco
- Somente migrations incrementais.
- Seeds locais idempotentes.
- Sem reset destrutivo do banco.

5. Entrega incremental confiavel
- PR por bloco finalizado.
- Nao misturar multiplos blocos criticos no mesmo PR.

## 5) Definition of Done (DoD) por bloco
Um bloco so fecha quando cumprir 100%:

### A. Funcionalidade
- Escopo funcional do bloco implementado localmente.
- Estados de UX completos (loading/error/empty/success) quando houver frontend.

### B. Seguranca e permissao
- Auth V2 e RequestContext aplicados.
- RBAC/ownership validados.
- Sem regressao para autorizacao por header.

### C. Banco e dados
- Schema evoluido por migration nova (quando necessario).
- Sem edicao de migration antiga.
- Seed atualizada e idempotente (se o bloco exigir dados demo).

### D. Testes
- Unitarios do bloco.
- Integracao do bloco.
- Testes de seguranca e multi-tenant.
- Regressao minima em modulos adjacentes.

### E. Validacoes locais obrigatorias
- `npm run check:encoding --workspace @delivery-futuro/web-v2`
- `npm run build --workspace @delivery-futuro/api-v2`
- `npm run test --workspace @delivery-futuro/api-v2 -- --runInBand`
- `npm run build --workspace @delivery-futuro/web-v2`

### F. Documentacao
- Documento tecnico do bloco atualizado.
- Contratos/API atualizados quando aplicavel.
- Limites e follow-ups explicitados.

### G. Entrega GitHub
- Branch dedicada.
- Commits focados no bloco.
- PR com template completo.

## 6) Padrao de branch/commit/PR
### Branch
- `feat/<bloco>-<nome-curto>`
- `fix/<bloco>-<nome-curto>`
- `docs/<tema>` para governanca/documentacao

### Commit
- `feat: <resumo do bloco>`
- `fix: <resumo do ajuste>`
- `docs: <resumo documental>`

### Titulo do PR
- `<tipo>: <bloco> <resumo>`

### Corpo obrigatorio do PR
1. Summary
2. Escopo do bloco
3. Decisoes de seguranca/auth/tenant
4. Impacto em schema/seed
5. Validacoes executadas
6. Riscos restantes
7. Follow-ups

## 7) Ordem macro de execucao recomendada
1. Fundacao e seguranca: 01, 02, 03, 98, 99, 100, 102
2. SaaS core: 77, 78, 79, 80, 81, 82
3. Admin core: 06, 07, 08, 09, 91
4. Operacao core: 11-18, 48-50, 56-58, 60-65, 96
5. Estoque/custos/financeiro: 19-47, 51-55, 66-75, 83-89, 97
6. Futuro (somente contrato/desenho por ora): 76, 92, 93, 94, 95
7. Produtos adicionais completos: 103, 104

## 8) Politica de risco e congelamento
- Nao iniciar bloco dependente sem prerequisito fechado.
- Nao introduzir integracao externa real antes de contrato + mock estavel.
- Nao aprovar PR sem checklist de seguranca e tenant.

## 9) Criterio de aprovacao interna de bloco
Antes de marcar como "Fechado":
- Build/test/check locais verdes.
- Revisao de seguranca concluida.
- Documento tecnico atualizado.
- PR pronto para merge com riscos claros.

## 10) Registro e rastreabilidade
- Cada bloco deve manter referencia de PR, commit e status.
- Decisoes estruturais devem gerar/atualizar ADR quando necessario.
- Nao apagar historico de decisoes tecnicas.

## 11) O que nao fazer agora
- Nao tocar servidor/HML/PRD.
- Nao executar deploy.
- Nao aplicar patch legado em lote.
- Nao acelerar com atalhos que reduzam seguranca ou cobertura.

## 12) Vigencia
Este documento entra em vigor imediatamente e permanece como regra oficial ate revisao explicita do projeto.
