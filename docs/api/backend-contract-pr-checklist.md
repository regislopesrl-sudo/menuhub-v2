# Checklist de PR para Contrato HTTP

Use esta checklist em PRs que mexem com endpoints, aliases, naming, ownership ou compatibilidade de contrato no backend.

## 1. Contrato HTTP

- [ ] A rota nova ou alterada está no namespace canonico correto?
- [ ] Existe risco de duplicar `method + path` com outro controller ou alias?
- [ ] A mudanca preserva compatibilidade quando necessario?

## 2. Ownership

- [ ] O owner do endpoint esta explicito no controller/modulo?
- [ ] A mudanca cria ambiguidade entre modulos?
- [ ] Precisa de teste de ownership ou colisao?

## 3. Aliases e legado

- [ ] A mudanca introduz alias novo?
- [ ] Esse alias precisa de `Deprecation`, `Sunset` e `Link`?
- [ ] Existe successor canonico claro?
- [ ] Precisa de telemetria ou metrica de uso legado?

## 4. Documentacao

- [ ] Precisa atualizar ADR existente?
- [ ] Precisa criar novo ADR?
- [ ] Precisa atualizar o indice/README de ADRs?

## 5. Testes

- [ ] Precisa de teste de contrato HTTP?
- [ ] Precisa de teste de paridade alias vs canonico?
- [ ] Precisa de teste HTTP de metrics ou depreciacao?
- [ ] Precisa de teste de colisao ou ownership?

## Regra pratica

Se a mudanca altera contrato, naming, ownership ou alias, cite o ADR relevante e anexe o teste que prova a decisao.
