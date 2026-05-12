# Bloco 127-137 - Billing SaaS Comercial Premium

## Melhoria incluida: liberacao tecnica manual de modulos

Esta melhoria complementa o pacote Billing SaaS / Comercial, mantendo a regra comercial centralizada:

- planos definem os modulos contratados;
- assinaturas definem se a empresa esta apta a usar os modulos;
- overrides manuais existem apenas para operacao tecnica da plataforma;
- admin da loja nao libera modulo comercial por conta propria.

## Regra de acesso

A alteracao manual de modulos por empresa deve ficar restrita ao nivel tecnico da plataforma.

Requisito aplicado no backend:

- `ctx.source === 'technical-admin'` pode operar;
- `platform:admin` pode operar;
- `*` pode operar;
- `platform:modules:manage` pode operar;
- `platform:companies:update` sozinho nao libera override de modulo;
- tenant roles como `owner`, `admin` ou `manager` nao viram platform automaticamente.

## Tela tecnica

A tela `/developer/companies/:companyId/modules` passa a deixar claro que e um painel de suporte tecnico, usado para:

- visualizar modulos do plano;
- visualizar bloqueios por assinatura;
- aplicar override manual quando autorizado;
- entender origem do acesso: plano, padrao ou override da empresa.

## Protecao comercial

Override tecnico nao substitui uma assinatura inativa.

Se a assinatura estiver cancelada, expirada, inadimplente ou ausente, a tela deve orientar a ativar a assinatura antes de alterar modulos.

## Fora de escopo desta melhoria

- gateway real de pagamento;
- faturamento automatico real;
- alteracao de schema Prisma;
- migration nova;
- integracao com servidor, HML ou producao;
- liberacao de modulos pelo admin da loja.

## Criterios de aceite

- backend bloqueia update de modulo sem `platform:modules:manage` ou superadmin platform;
- tela tecnica explica a regra de liberacao manual;
- assinatura continua sendo pre-condicao para alteracao;
- auditoria existente de override e preservada;
- API e Web continuam validando localmente.
