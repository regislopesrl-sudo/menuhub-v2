# 1. Objetivo da pagina

A pagina **Margem por Produto** deve responder em poucos segundos:

1. Quais produtos mais geram resultado.
2. Quais produtos destroem margem.
3. Qual o impacto de custo e desconto na rentabilidade.
4. Onde agir em preco, mix e operacao.

Publico-alvo:
- Diretoria
- Comercial
- Pricing
- Controladoria
- Operacao

# 2. Estrutura visual sugerida

Leitura recomendada: **topo -> campeoes -> riscos -> causa -> acao**.

```text
+--------------------------------------------------------------------------------------------------+
| TITULO: Margem por Produto | Ultimo refresh | Periodo | Filial | Canal | Tipo pedido | Categoria |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP: Receita Produto | Custo Produto | Margem Bruta | Margem % | Qtd Vendida | Ticket Item |
|            Produtos Margem Negativa | Produtos abaixo limite | Contribuicao no Lucro            |
+------------------------------------------------------+-------------------------------------------+
| Ranking Top Rentabilidade (6 col)                   | Ranking Baixa Margem (6 col)              |
| Top N por margem bruta                              | Bottom N e margem negativa                |
+------------------------------------------------------+-------------------------------------------+
| Scatter Preco x Custo x Margem (8 col)              | Waterfall impacto margem (4 col)          |
| Receita no eixo X, Margem % no eixo Y, tamanho qtd  | Receita -> Desconto -> Custo -> Margem    |
+------------------------------------------------------+-------------------------------------------+
| Evolucao temporal (6 col)                           | Comparacao por categoria (6 col)          |
| Margem %, Receita e Custo por mes                   | Receita, custo e margem % por categoria   |
+--------------------------------------------------------------------------------------------------+
| Heatmap Filial x Categoria (12 col): margem % e criticidade                                    |
+--------------------------------------------------------------------------------------------------+
| Matriz de excecoes (12 col): produto | filial | receita | custo | margem % | desconto | acao    |
+--------------------------------------------------------------------------------------------------+
```

Blocos e funcao:
1. KPI strip: fotografia executiva.
2. Ranking Top/Bottom: foco em resultado e risco.
3. Scatter + waterfall: explicar causa de margem.
4. Evolucao + categoria: tendencia e concentracao.
5. Heatmap + excecoes: prioridade de acao.

# 3. KPIs principais

Mapeamento para medidas/campos existentes no projeto:

1. **Faturamento por produto** -> `Net Revenue` por produto
2. **Custo total por produto** -> custo real por item (`actual_cost_total`/`CMV Real`)
3. **Margem bruta por produto** -> `Margin by Product` ou `Net Revenue - Custo`
4. **Margem percentual** -> `Gross Margin %`
5. **Quantidade vendida** -> soma de `quantity` (itens)
6. **Ticket medio do item** -> `Average Item Value`
7. **Produtos com margem negativa** -> contagem produtos com margem < 0
8. **Produtos com margem abaixo da meta** -> contagem abaixo de limite gerencial
9. **Contribuicao para lucro total** -> margem do produto / margem total

Observacao de consistencia:
- O schema compartilhado nao traz tabela de meta de margem por produto.
- Para "abaixo da meta", usar limite parametrico de controladoria (ajuste minimo).

# 4. Visuais recomendados

1. **Cards KPI** para indicadores de topo.
2. **Barras horizontais** para Top N e Bottom N.
3. **Ranking Top N** por margem e por receita.
4. **Scatter plot** para preco x margem % x volume.
5. **Matriz por produto** com receita, custo, margem, desconto e contribuicao.
6. **Linha temporal** de margem %, receita e custo.
7. **Heatmap de margem** por filial x categoria.
8. **Tabela de excecoes** com priorizacao por impacto financeiro.
9. **Waterfall** de impacto (receita -> desconto -> custo -> margem).
10. **Semaforo** de risco de margem.

# 5. Storytelling executivo

Narrativa recomendada:

1. Mostrar produtos que mais geram resultado.
2. Mostrar produtos com risco (margem baixa/negativa).
3. Explicar relacao custo x preco e efeito do desconto.
4. Mostrar evolucao temporal e diferencas entre filiais/categorias.
5. Encerrar com itens que exigem acao imediata.

Mensagem central:
- "Margem caiu/subiu por mix, desconto, custo ou execucao por filial."

# 6. Filtros e segmentacoes

## 6.1 Globais

1. Periodo
2. Filial
3. Canal
4. Tipo de pedido
5. Categoria

## 6.2 Locais

1. Produto
2. Status do pedido
3. Faixa de margem
4. Faixa de preco

## 6.3 Regras praticas

- Filtros globais sempre visiveis no topo.
- Filtros locais apenas em blocos analiticos.
- Evitar slicers tecnicos (IDs).

# 7. Alertas e excecoes

Destacar no painel de alertas:

1. **Margem negativa** por produto
2. **Margem abaixo do limite** gerencial
3. **Custo acima do padrao** da categoria
4. **Alto volume com baixa rentabilidade**
5. **Queda de margem** relevante vs periodo anterior
6. **Desconto excessivo** corroendo margem
7. **Categoria com baixa performance** de margem

Priorizacao:
- Critico: margem negativa + alto volume.
- Alto: queda de margem recorrente + desconto alto.
- Medio: baixa contribuicao com alto custo de operacao.

# 8. Padrao visual

Paleta sugerida:
- Alta margem: `#16A34A`
- Alerta: `#F59E0B`
- Risco: `#DC2626`
- Receita/contexto: `#1D4ED8`
- Neutro: `#64748B`

Regras visuais:
1. Titulos curtos e orientados a decisao.
2. Blocos grandes, sem excesso de mini-graficos.
3. Mesma semantica de cor em toda a suite executiva.
4. Semaforo apenas para risco real de decisao.
5. Cards com variacao vs periodo anterior.

Mobile-first:
- Ordem mobile: KPI -> Top/Bottom -> alertas -> tendencia -> excecoes.

# 9. Recomendacao final de implementacao

Sequencia pratica no Power BI:

1. Criar pagina `04_Margem_Produto_Mix`.
2. Inserir KPI strip e validar formatacao.
3. Montar ranking Top N e Bottom N.
4. Montar scatter e waterfall de impacto.
5. Montar evolucao temporal e comparativo por categoria.
6. Inserir heatmap filial x categoria.
7. Inserir matriz de excecoes com ordenacao por impacto.
8. Configurar interacoes simples (drill-through em 1 clique).

Checklist de aceite:
- Produtos criticos identificados em segundos.
- Causa da erosao de margem visivel (desconto/custo/mix).
- Acoes recomendadas claras para comercial e pricing.
