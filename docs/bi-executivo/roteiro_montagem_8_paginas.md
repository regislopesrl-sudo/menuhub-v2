# Roteiro de Montagem das 8 Paginas

Guia unico para montar a suite executiva inteira no Power BI Desktop, reaproveitando a pagina base e evitando redesenhar tudo do zero.

Base do projeto:

- modelo `Dim_*` + `Fato_*`
- tema `tema_executivo.json`
- medidas de `medidas_principais.dax`
- medidas de `medidas_executivas_operacionais.dax`

## Ordem recomendada

1. `01_Visao_Geral_Executiva`
2. `02_Vendas_Ticket`
3. `03_DRE_CMV`
4. `04_Margem_Produto_Mix`
5. `05_Estoque_Consumo`
6. `06_Financeiro_Caixa`
7. `07_Operacao_Filial`
8. `08_Alertas_Excecoes`

## Como usar este roteiro

Em vez de criar cada pagina do zero:

1. finalize a `01_Visao_Geral_Executiva`
2. duplique essa pagina
3. renomeie a copia
4. mantenha tema, slicers e padrao visual
5. troque apenas cards e visuais centrais

O que manter em todas as paginas:

- slicer `Dim_Calendario[year_month]`
- slicer `Dim_Filial[branch_display_name]`
- tema aplicado
- mesma largura dos cards
- mesma paleta de cores
- titulos curtos

O que limpar ao duplicar:

- graficos da pagina anterior
- tabelas de resumo que nao pertencem ao novo tema
- cards que nao respondem a pergunta da nova pagina

## Regras fixas para todas as paginas

- relacionamentos sempre `*:1` com filtro `Unica`
- preferir medidas DAX aos campos brutos
- usar `Dim_Calendario[year_month]` para eixo mensal
- usar `Dim_Filial[branch_display_name]` para comparativo por unidade
- usar `Lista suspensa` nos slicers principais
- evitar mais de 7 visuais grandes por pagina
- manter a historia da pagina na ordem: KPI -> tendencia -> comparativo -> risco -> acao

Filtros globais recomendados:

- `Dim_Calendario[year_month]`
- `Dim_Filial[branch_display_name]`
- `Fato_Pedidos[channel]`
- `Fato_Pedidos[order_type]`

## Estrutura base da pagina

Use esta estrutura em quase todas as abas:

1. topo com titulo + slicers
2. linha de KPIs
3. grafico principal de tendencia
4. comparativo por filial, produto, canal ou conta
5. tabela final de excecoes

## 01_Visao_Geral_Executiva

Objetivo:
- mostrar resultado consolidado, direcao e risco.

KPIs do topo:

- `Receita Liquida`
- `Margem Bruta %`
- `Resultado Operacional`
- `Pedidos Finalizados`
- `Ticket Medio`
- `Cancellation Rate %`

KPIs secundarios:

- `Receita Bruta`
- `CMV Real %`
- `Accounts Receivable`
- `Accounts Payable`

Visuais:

- 6 cards principais
- 4 cards secundarios
- linha temporal com `Receita Liquida`, `CMV Real`, `Operating Result`
- ranking de filiais com `Performance by Branch` ou `Operating Result`
- waterfall resumido
- tabela de excecoes

Campos base:

- `Dim_Calendario[year_month]`
- `Dim_Filial[branch_display_name]`

## 02_Vendas_Ticket

Objetivo:
- explicar crescimento ou queda de vendas e ticket.

O que manter da pagina 01:

- slicers do topo
- linha de KPIs
- mesma estrutura visual

O que trocar:

- remova waterfall, bloco financeiro e resumo operacional
- troque o grafico principal por vendas e ticket

KPIs do topo:

- `Gross Revenue`
- `Net Revenue`
- `Average Ticket`
- `Total Orders`
- `Orders Finalized`
- `Cancellation Rate %`

Visuais:

- linha temporal com `Net Revenue` e `Average Ticket`
- barras por `Fato_Pedidos[channel]`
- barras por `Fato_Pedidos[order_type]`
- heatmap `Filial x Canal`
- Top N produtos por receita
- tabela mensal de vendas e ticket

Campos base:

- `Dim_Calendario[year_month]`
- `Dim_Filial[branch_display_name]`
- `Fato_Pedidos[channel]`
- `Fato_Pedidos[order_type]`
- `Dim_Produto[product_name]`

Medidas principais:

- `Gross Revenue`
- `Net Revenue`
- `Average Ticket`
- `Orders by Channel`
- `Orders by Type`
- `Cancellation Rate %`

## 03_DRE_CMV

Objetivo:
- ler resultado operacional e desvio de CMV.

O que manter da pagina 02:

- slicers
- faixa de KPIs
- tabela final

O que trocar:

- troque foco comercial por foco de resultado
- insira waterfall e comparativo CMV

KPIs do topo:

- `Receita Bruta`
- `Receita Liquida`
- `CMV Teorico`
- `CMV Total`
- `Lucro Bruto`
- `Margem Bruta %`
- `Resultado Operacional`
- `Margem Operacional %`
- `Desvio CMV`

Visuais:

- tendencia mensal com `Receita Liquida`, `CMV Total`, `Lucro Bruto`, `Resultado Operacional`
- comparativo `CMV Total` x `CMV Teorico`
- waterfall DRE
- ranking de filiais
- matriz por filial
- tabela de alertas

Campos base:

- `Dim_Calendario[year_month]`
- `Dim_Filial[branch_display_name]`

Medidas principais:

- `Receita Bruta`
- `Receita Liquida`
- `CMV Teorico`
- `CMV Total`
- `Desvio CMV`
- `Lucro Bruto`
- `Margem Bruta %`
- `Resultado Operacional`
- `Margem Operacional %`

## 04_Margem_Produto_Mix

Objetivo:
- mostrar rentabilidade por produto e categoria.

O que manter da pagina 03:

- slicers
- cards no topo
- tabela final

O que trocar:

- remova matriz por filial e waterfall DRE
- foque em produto, categoria e margem

KPIs do topo:

- `Net Revenue`
- `CMV Real`
- `Gross Margin`
- `Gross Margin %`
- `Average Item Value`
- contagem de produtos com margem negativa

Visuais:

- Top N produtos por margem
- Bottom N produtos por margem
- scatter `Receita x Margem %`
- comparativo por categoria
- evolucao temporal da margem
- matriz produto/categoria
- tabela de excecoes

Campos base:

- `Dim_Produto[product_name]`
- `Dim_Produto[category_name]`
- `Dim_Filial[branch_display_name]`
- `Dim_Calendario[year_month]`

Medidas principais:

- `Net Revenue`
- `CMV Real`
- `Gross Margin`
- `Gross Margin %`
- `Average Item Value`
- `Margin by Product`

## 05_Estoque_Consumo

Objetivo:
- mostrar estoque, consumo, perdas e risco de ruptura.

O que manter da pagina 04:

- slicers
- faixa de cards
- tabela final

O que trocar:

- tire foco de produto vendido e mude para item de estoque
- troque scatter por tendencia de consumo e risco

KPIs do topo:

- `Stock Closing Value`
- `Stock Closing Qty`
- `Stock Consumption`
- `Quantity Consumed`
- `Stock Turnover`
- `Losses and Adjustments`
- `Critical Items`

Visuais:

- cards de estoque e consumo
- linha temporal de consumo
- barras Top N itens consumidos
- barras de perdas e ajustes
- heatmap de risco
- matriz executiva por item
- tabela de excecoes

Campos base:

- `Fato_Kardex[stock_item_name]`
- `Fato_Kardex[stock_category_name]`
- `Fato_Kardex[movement_type]`
- `Dim_Calendario[year_month]`
- `Dim_Filial[branch_display_name]`

Medidas principais:

- `Stock Closing Value`
- `Stock Closing Qty`
- `Stock Consumption`
- `Quantity Consumed`
- `Stock Turnover`
- `Losses and Adjustments`
- `Critical Items`

## 06_Financeiro_Caixa

Objetivo:
- mostrar liquidez, aberto, vencido e saldo.

O que manter da pagina 05:

- slicers
- cards
- tabela final

O que trocar:

- remova blocos de estoque
- troque por fluxo financeiro, aging e ranking de risco

KPIs do topo:

- `Accounts Receivable`
- `Accounts Payable`
- `Financial Balance`
- `Receipts Period`
- `Payments Period`
- `Default Amount`
- `Default %`

Visuais:

- linha temporal `Receipts Period`, `Payments Period`, `Financial Balance`
- aging de vencimento
- ranking de risco por filial
- barras `Receber vs Pagar`
- matriz de titulos em aberto
- tabela de excecoes

Campos base:

- `Dim_Calendario[year_month]`
- `Dim_Filial[branch_display_name]`
- `Fato_Financeiro[financial_status]`
- `Fato_Financeiro[source_type]`
- `Dim_Cliente[customer_name]`

Medidas principais:

- `Accounts Receivable`
- `Accounts Payable`
- `Financial Balance`
- `Default Amount`
- `Default %`
- `Receipts Period`
- `Payments Period`

## 07_Operacao_Filial

Objetivo:
- mostrar eficiencia operacional por unidade.

O que manter da pagina 06:

- slicers
- faixa de KPIs
- tabela final

O que trocar:

- remova aging e contas
- foque em volume, tempo, produtividade e cancelamento

KPIs do topo:

- `Net Revenue`
- `Orders by Branch`
- `Average Ticket`
- `Gross Margin`
- `Operating Result`
- `Cancellation Rate %`
- `Finalization Rate %`
- `Average Prep Time (min)`
- `Average Delivery Time (min)`
- `Orders per Hour`
- `Operational Productivity`

Visuais:

- ranking de filiais
- semaforo de performance
- linha temporal de pedidos, receita e cancelamento
- scatter de eficiencia
- comparativo canal x filial
- comparativo tipo pedido x filial
- heatmap filial x horario
- tabela de excecoes

Campos base:

- `Dim_Filial[branch_display_name]`
- `Dim_Calendario[year_month]`
- `Fato_Pedidos[channel]`
- `Fato_Pedidos[order_type]`
- `Fato_Pedidos[order_status]`

Medidas principais:

- `Orders by Branch`
- `Average Ticket`
- `Gross Margin`
- `Operating Result`
- `Cancellation Rate %`
- `Finalization Rate %`
- `Average Prep Time (min)`
- `Average Delivery Time (min)`
- `Orders per Hour`
- `Operational Productivity`
- `Performance by Branch`

## 08_Alertas_Excecoes

Objetivo:
- consolidar anomalias criticas em uma pagina unica de acao.

O que manter da pagina 07:

- slicers
- faixa superior
- tabela final

O que trocar:

- remova graficos analiticos longos
- concentre em semaforo, ranking de impacto e lista final de alerta

KPIs do topo:

- alertas de CMV
- produtos com margem negativa
- filiais com resultado operacional negativo
- titulos vencidos
- itens criticos

Visuais:

- cards de quantidade de alertas
- semaforo consolidado
- ranking de impacto financeiro
- tabela unica de excecoes por prioridade
- slicer por tipo de alerta

Filtros locais:

- tipo de alerta
- filial
- periodo

Medidas recomendadas:

- `Desvio CMV`
- `Gross Margin %`
- `Operating Result`
- `Default Amount`
- `Critical Items`

Regras praticas:

- critico em vermelho
- atencao em amarelo
- controlado em verde
- ordenar sempre por impacto financeiro ou risco

## Sequencia pratica no Power BI

1. finalize a `01_Visao_Geral_Executiva`
2. duplique a pagina e renomeie para `02_Vendas_Ticket`
3. troque apenas cards e visuais centrais
4. repita a duplicacao para `03_DRE_CMV`
5. siga a mesma logica ate `07_Operacao_Filial`
6. crie `08_Alertas_Excecoes` por ultimo, consolidando o que ja ficou pronto

## Ordem de menor friccao

Se quiser montar sem se perder:

1. feche a pagina 01
2. monte a pagina 02
3. monte a pagina 03
4. monte a pagina 04
5. monte a pagina 05
6. monte a pagina 06
7. monte a pagina 07
8. finalize com a pagina 08

Esse fluxo reaproveita header, slicers, cores e tamanho dos visuais sem redesenhar tudo a cada aba.
