# Modelo Estrela Power BI (Executivo)

## 1. Mapa conceitual do modelo

```text
                    Dim_Calendario
                       /   |    \
                      /    |     \
                     /     |      \
             Fato_Pedidos  |   Fato_Kardex
                   |       |         |
                   |       |         |
           Fato_Itens_Pedido         |
                   |                 |
                   |                 |
            Fato_Margem_Produto   Fato_CMV_Mensal
                   \                 /
                    \               /
                     \             /
                       Fato_DRE_Mensal
                               |
                               |
                  Fato_Resultado_Operacional

Dim_Filial ----------^    Dim_Produto ------^
Dim_Cliente ---------^    Dim_Conta_Financeira -> Fato_Financeiro
```

- Modelo em estrela, com dimensoes conformadas `Dim_Calendario`, `Dim_Filial`, `Dim_Produto`, `Dim_Cliente`.
- Fatos de granularidades diferentes permanecem separados para evitar ambiguidade.

## 2. Granularidade por fato

- `vw_fato_pedidos`: 1 linha por pedido (`order_id`).
- `vw_fato_itens_pedido`: 1 linha por item de pedido (`order_item_id`).
- `vw_fato_kardex`: 1 linha por movimento de estoque (`movement_id`).
- `vw_fato_financeiro`: 1 linha por titulo financeiro (`financial_id` + `source_type`).
- `vw_dre_mensal`: 1 linha por mes + filial.
- `vw_cmv_mensal`: 1 linha por mes + filial.
- `vw_margem_produto`: 1 linha por mes + filial + produto.
- `vw_resultado_operacional`: 1 linha por mes + filial.

## 3. Relacionamentos (PK/FK, cardinalidade, direcao)

Diretriz: sempre `1:*`, filtro unidirecional da dimensao para o fato.

1. `Dim_Calendario[date_day]` -> `Fato_Pedidos[order_date]` (`1:*`, single)
2. `Dim_Calendario[date_day]` -> `Fato_Itens_Pedido[order_date]` (`1:*`, single)
3. `Dim_Calendario[date_day]` -> `Fato_Kardex[movement_date]` (`1:*`, single)
4. `Dim_Calendario[date_day]` -> `Fato_Financeiro[reference_date]` (`1:*`, single)
5. `Dim_Calendario[date_day]` -> `Fato_DRE_Mensal[month_date]` (`1:*`, single)
6. `Dim_Calendario[date_day]` -> `Fato_CMV_Mensal[month_date]` (`1:*`, single)
7. `Dim_Calendario[date_day]` -> `Fato_Margem_Produto[month_date]` (`1:*`, single)
8. `Dim_Calendario[date_day]` -> `Fato_Resultado_Operacional[month_date]` (`1:*`, single)
9. `Dim_Filial[branch_id]` -> `Fato_Pedidos[branch_id]` (`1:*`, single)
10. `Dim_Filial[branch_id]` -> `Fato_Itens_Pedido[branch_id]` (`1:*`, single)
11. `Dim_Filial[branch_id]` -> `Fato_Kardex[branch_id]` (`1:*`, single)
12. `Dim_Filial[branch_id]` -> `Fato_Financeiro[branch_id]` (`1:*`, single)
13. `Dim_Filial[branch_id]` -> `Fato_DRE_Mensal[branch_id]` (`1:*`, single)
14. `Dim_Filial[branch_id]` -> `Fato_CMV_Mensal[branch_id]` (`1:*`, single)
15. `Dim_Filial[branch_id]` -> `Fato_Margem_Produto[branch_id]` (`1:*`, single)
16. `Dim_Filial[branch_id]` -> `Fato_Resultado_Operacional[branch_id]` (`1:*`, single)
17. `Dim_Produto[product_id]` -> `Fato_Itens_Pedido[product_id]` (`1:*`, single)
18. `Dim_Produto[product_id]` -> `Fato_Margem_Produto[product_id]` (`1:*`, single)
19. `Dim_Cliente[customer_id]` -> `Fato_Pedidos[customer_id]` (`1:*`, single)
20. `Dim_Cliente[customer_id]` -> `Fato_Itens_Pedido[customer_id]` (`1:*`, single)
21. `Dim_Cliente[customer_id]` -> `Fato_Financeiro[customer_id]` (`1:*`, single)
22. `Dim_Conta_Financeira[conta_financeira_id]` -> `Fato_Financeiro[conta_financeira_id]` (`1:*`, single)

## 4. Tabela fato principal por dashboard

1. Dashboard Comercial (vendas, ticket, mix): `Fato_Itens_Pedido` + `Fato_Pedidos`.
2. Dashboard CMV/Estoque: `Fato_Kardex` (detalhe) + `Fato_CMV_Mensal` (executivo).
3. Dashboard Financeiro: `Fato_Financeiro`.
4. Dashboard DRE executivo: `Fato_DRE_Mensal`.
5. Dashboard Margem por produto: `Fato_Margem_Produto`.
6. Dashboard Resultado Operacional: `Fato_Resultado_Operacional`.

## 5. Boas praticas de modelagem (aplicadas)

1. Sem relacionamento bidirecional por padrao.
2. Sem snowflake desnecessario.
3. Dimensoes conformadas compartilhadas entre fatos.
4. Calendario central para todas as analises temporais.
5. Chaves sinteticas "desconhecido" para evitar perda de linhas em fatos.

## 6. Performance e modo de armazenamento

### Import (recomendado)

- `vw_dim_calendario`
- `vw_dim_filial`
- `vw_dim_produto`
- `vw_dim_cliente`
- `vw_dim_conta_financeira`
- `vw_fato_pedidos`
- `vw_fato_itens_pedido`
- `vw_dre_mensal`
- `vw_cmv_mensal`
- `vw_margem_produto`
- `vw_resultado_operacional`

Motivo: alta compressao, melhor experiencia em DAX e painel executivo responsivo.

### DirectQuery (quando aplicavel)

- `vw_fato_kardex` e/ou `vw_fato_financeiro` somente se houver necessidade de quase tempo real e alto volume.

Motivo: fatos transacionais com maior churn; usar apenas quando o SLA exigir latencia baixa.

### Recomendacoes adicionais

1. Usar Incremental Refresh para fatos detalhados (`Fato_Itens_Pedido`, `Fato_Kardex`, `Fato_Financeiro`).
2. Desativar Auto Date/Time no Power BI.
3. Manter colunas de texto fora de fatos quando nao forem usadas em filtro/visual.
