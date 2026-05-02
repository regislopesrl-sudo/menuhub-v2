# 1. Objetivo da pagina

A pagina **Estoque e Consumo** deve responder rapidamente:

1. Quanto temos em estoque (quantidade e valor).
2. Quanto estamos consumindo no periodo.
3. Onde existem perdas, ajustes e risco de ruptura.
4. Qual impacto do estoque no CMV e no resultado.

Publico-alvo:
- Diretoria
- Compras
- Estoque
- Operacao
- Controladoria

# 2. Estrutura visual sugerida

Leitura ideal: **topo -> tendencia -> risco -> acao**.

```text
+--------------------------------------------------------------------------------------------------+
| TITULO: Estoque e Consumo | Ultimo refresh | Periodo | Filial | Grupo estoque | Tipo movimento  |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP: Estoque Atual (R$) | Estoque Atual (Qtd) | Consumo Periodo (R$) | Consumo Medio Mensal |
|            Giro Estoque | Perdas | Ajustes | Itens Criticos | Itens abaixo do minimo | Impacto no CMV |
+------------------------------------------------------+-------------------------------------------+
| Estoque atual x variacao (6 col)                    | Consumo mensal (6 col)                    |
| Estoque Inicial, Estoque Final, Variacao            | Stock Consumption e Quantity Consumed     |
+------------------------------------------------------+-------------------------------------------+
| Ranking de itens consumidos (6 col)                 | Perdas e ajustes por periodo (6 col)      |
| Top N por custo consumido                           | LOSS e ADJUSTMENT                          |
+--------------------------------------------------------------------------------------------------+
| Heatmap de risco (12 col): item/grupo x filial (criticidade, ruptura, sem giro)                 |
+--------------------------------------------------------------------------------------------------+
| Matriz executiva (12 col): item | estoque final | consumo | perdas | ajustes | giro | impacto    |
+--------------------------------------------------------------------------------------------------+
| Tabela de excecoes e alertas (12 col): tipo alerta | item | filial | valor | impacto | prioridade  |
+--------------------------------------------------------------------------------------------------+
```

Blocos:
1. KPI strip: saude consolidada do estoque.
2. Evolucao: comportamento de consumo e variacao.
3. Diagnostico: itens de maior impacto.
4. Risco: ruptura, sem giro e perdas.
5. Acao: excecoes priorizadas.

# 3. KPIs principais

Mapeamento para medidas/campos existentes:

1. **Estoque atual em valor** -> `Stock Closing Value`
2. **Estoque atual em quantidade** -> `Stock Closing Qty`
3. **Consumo no periodo** -> `Stock Consumption` e `Quantity Consumed`
4. **Consumo medio mensal** -> `DIVIDE([Stock Consumption], DISTINCTCOUNT(Dim_Calendario[year_month]))`
5. **Giro de estoque** -> `Stock Turnover`
6. **Perdas** -> filtro `movement_type = LOSS` em `Fato_Kardex[total_cost_abs]`
7. **Ajustes** -> filtro `movement_type = ADJUSTMENT` em `Fato_Kardex[total_cost_abs]`
8. **Itens criticos** -> `Critical Items`
9. **Itens abaixo do minimo** -> ver observacao de consistencia abaixo
10. **Impacto do estoque no CMV** -> `DIVIDE([Stock Consumption], [CMV Real], 0)`

Observacao de consistencia (ajuste minimo):
- O schema possui `stock_items.minimum_quantity` e `stock_items.reorder_point`.
- A `vw_fato_kardex` atual nao expõe esses campos.
- Enquanto isso, usar proxy: **Itens abaixo do minimo = [Stock Closing Qty by Item] <= 0**.
- Correcao minima recomendada da view: adicionar `minimum_quantity`, `reorder_point`, `is_critical`, `supplier_id`.

# 4. Visuais recomendados

1. **Cards KPI** para os indicadores de topo.
2. **Linha temporal** para consumo e variacao de estoque.
3. **Barras horizontais** para Top N itens consumidos e itens com perdas.
4. **Matriz por item** para leitura de estoque, consumo, perdas, giro e impacto.
5. **Ranking Top N** por impacto financeiro (`total_cost_abs`).
6. **Tabela de excecoes** com ordenacao por impacto.
7. **Heatmap de risco** por item/grupo x filial.
8. **Grafico de variacao** (`Stock Closing Qty - Stock Opening Qty`).
9. **Indicador de ruptura** (semaforo por item).
10. **Semaforo de criticidade** no bloco de alertas.

# 5. Storytelling executivo

Narrativa recomendada:

1. Mostrar o estoque total (valor e quantidade).
2. Mostrar o consumo no periodo e a tendencia.
3. Mostrar desvios (perdas, ajustes, variacao fora da curva).
4. Mostrar itens criticos e risco de ruptura.
5. Mostrar impacto no CMV.
6. Encerrar com tabela de acoes priorizadas.

Mensagem central:
- "Onde o estoque esta pressionando custo, margem e continuidade operacional."

# 6. Filtros e segmentacoes

## 6.1 Globais

1. Periodo
2. Filial
3. Grupo de estoque (`stock_category_name`)
4. Tipo de movimento (`movement_type`)

## 6.2 Locais

1. Item (`stock_item_name`)
2. Categoria (grupo detalhado)
3. Status de criticidade (derivado por regra de risco)
4. Fornecedor (se campo estiver exposto no modelo)

## 6.3 Regras praticas

- Globais no topo, sempre visiveis.
- Locais apenas nos blocos de diagnostico.
- Se `supplier_id` nao estiver no modelo, ocultar slicer de fornecedor ate ajuste da view.

# 7. Alertas e excecoes

Destaques obrigatorios:

1. **Estoque abaixo do minimo** (proxy atual: estoque final <= 0; depois usar minimum_quantity).
2. **Consumo fora da curva** (consumo do periodo acima da media movel).
3. **Perdas acima da meta** (enquanto nao houver tabela de meta, usar limite de controladoria por parametro).
4. **Ajuste excessivo** (ADJUSTMENT acima do limite do periodo).
5. **Item sem giro** (estoque final > 0 e sem consumo no periodo).
6. **Ruptura iminente** (estoque final <= ponto de ruptura definido).
7. **Divergencia teorico x real** (`Stock Consumption` vs `CMV Theoretical`).

Priorizacao:
- Critico: risco de ruptura + alto impacto financeiro.
- Alto: perdas/ajustes recorrentes.
- Medio: sem giro com capital imobilizado.

# 8. Padrao visual

Paleta sugerida:
- Normalidade/estoque saudavel: `#16A34A`
- Atenção/alerta: `#F59E0B`
- Risco/ruptura/perda: `#DC2626`
- Consumo/volume: `#1D4ED8`
- Neutro: `#64748B`

Regras visuais:
1. Titulos curtos, orientados a decisao.
2. Poucos visuais, blocos grandes e legiveis.
3. Semaforo para risco (verde/amarelo/vermelho).
4. Evitar excesso de mini-graficos.
5. Manter mesma semantica de cores em todas as paginas.

Mobile-first:
- Ordem: KPI -> alertas -> consumo -> ranking -> excecoes.
- Um visual principal por dobra da tela.

# 9. Recomendacao final de implementacao

Passo a passo:

1. Criar pagina `05_Estoque_Consumo`.
2. Inserir KPI strip com medidas de estoque e consumo.
3. Inserir tendencia de consumo e variacao de estoque.
4. Inserir ranking de itens consumidos e bloco de perdas/ajustes.
5. Inserir heatmap de risco e matriz executiva.
6. Inserir tabela de excecoes com prioridade por impacto.
7. Configurar interacoes simples (drill-through em 1 clique).
8. Validar com operacao + controladoria (leitura em 5 segundos).

Checklist de aceite:
- Risco de ruptura visivel imediatamente.
- Diferenciacao clara entre consumo normal e desvio.
- Impacto no CMV explicito.
- Acoes recomendadas objetivas na tabela final.
