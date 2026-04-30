# 1. Objetivo da pagina inicial

A pagina **Visao Geral Executiva** deve responder em ate 5 segundos:

1. Como esta o negocio agora (resultado consolidado).
2. Se a operacao esta saudavel (funil e cancelamento).
3. Onde estao os desvios (CMV, margem, financeiro, estoque).
4. Quais filiais puxam ou derrubam o resultado.

Escopo alinhado ao modelo existente (`vw_fato_*`, `vw_dim_*`) e medidas DAX ja publicadas em:

- `medidas_executivas_operacionais.dax`
- `medidas_principais.dax`

Observacao importante:
- O schema/views atuais **nao expoem tabela de meta por filial**. Para o KPI "Filiais fora da meta", usar inicialmente o proxy **Filiais com Resultado Operacional < 0** (ajuste minimo, sem criar fonte nova).

# 2. Wireframe proposto

## 2.1 Layout desktop (12 colunas)

Canvas recomendado:
- `16:9` (1366 x 768) para consumo executivo.
- Margens: 12 px externas.
- Gutter horizontal/vertical: 8 px.

Leitura: esquerda -> direita, cima -> baixo.

```text
+--------------------------------------------------------------------------------------------------+
| [Titulo da pagina] [Ultima atualizacao] [Periodo] [Filial] [Canal/OrderType] [Botao Navegacao] |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP PRIMARIO (6 cards): Receita Liquida | Margem Bruta % | Resultado Operacional |       |
|                           Pedidos Finalizados | Ticket Medio | Taxa Cancelamento %       |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP SECUNDARIO (chips/cards compactos): Receita Bruta | CMV Real % | Contas em Aberto |   |
| Produtos com Margem Negativa | Filiais Resultado Negativo                                      |
+------------------------------------------------------+-------------------------------------------+
| Tendencia temporal (8 col)                           | Semaforo de alertas (4 col)             |
| Receita Liquida, CMV Real, Resultado Operacional     | CMV | Cancelamento | Estoque | Financeiro |
+--------------------------------------+---------------+-------------------------------------------+
| Ranking de filiais (6 col)           | Resumo operacao por status (6 col)                    |
| Top/Bottom por Resultado/Margem      | CONFIRMED -> IN_PREPARATION -> READY -> OUT_FOR_DEL.. |
+--------------------------------------+-------------------------------------------------------+
| Waterfall DRE resumida (6 col)       | Bloco de excecao (6 col)                              |
| Receita Bruta -> Liquida -> CMV ->   | Produtos margem negativa / contas vencidas / estoque  |
| Lucro Bruto -> Resultado Operacional | critico                                                |
+--------------------------------------------------------------------------------------------------+
| Tabela de excecoes acionaveis (12 col): filial | produto/conta | indicador | impacto | acao      |
+--------------------------------------------------------------------------------------------------+
```

## 2.2 Funcao de cada bloco

1. **Cabecalho**: contexto de filtro e navegacao macro.
2. **KPI primario**: fotografia financeira/operacional imediata.
3. **KPI secundario**: risco consolidado.
4. **Tendencia**: direcao do negocio (subindo/caindo).
5. **Ranking filial**: comparativo de performance.
6. **Semaforo**: gravidade executiva.
7. **Waterfall DRE**: narrativa do resultado.
8. **Excecoes**: priorizacao de acao.

# 3. Hierarquia visual

## 3.1 Destaque maximo (topo)

- `Receita Liquida`
- `Margem Bruta %`
- `Resultado Operacional`

Regra: cards maiores e com variacao percentual vs periodo anterior.

## 3.2 Nivel intermediario

- Pedidos Finalizados
- Ticket Medio
- Taxa Cancelamento %
- CMV Real %
- Contas em Aberto

## 3.3 Nivel de diagnostico

- Tendencia temporal
- Ranking por filial
- Waterfall DRE

## 3.4 Nivel detalhado (secundario/drill)

- Tabela de excecoes
- Detalhe por produto/filial/conta

# 4. KPIs da pagina

Mapeamento para medidas/campos existentes (sem criar campo novo):

1. **Receita Bruta** -> `Gross Revenue` / `Receita Bruta`
2. **Receita Liquida** -> `Net Revenue` / `Receita Liquida`
3. **CMV Real** -> `CMV Real`
4. **Margem Bruta (valor)** -> `Gross Margin`
5. **Margem Bruta %** -> `Gross Margin %`
6. **Resultado Operacional** -> `Operating Result` / `Resultado Operacional`
7. **Ticket Medio** -> `Average Ticket` / `Ticket Medio`
8. **Total de Pedidos** -> `Total Orders` / `Orders Finalized`
9. **Taxa de Cancelamento** -> `Cancellation Rate %`
10. **Contas em Aberto** -> `Accounts Receivable` + `Accounts Payable`
11. **Produtos com margem negativa** -> `vw_margem_produto.margem_bruta_real_pct < 0`
12. **Filiais fora da meta (proxy)** -> `Operating Result < 0`

# 5. Componentes recomendados

## 5.1 Blocos e visuais

1. **Cards KPI** (6 principais + 5 secundarios compactos)
2. **Line chart** (tendencia mensal)
   - Eixo: `Dim_Calendario[year_month]`
   - Valores: `Net Revenue`, `CMV Real`, `Operating Result`
3. **Barra horizontal** (ranking filial)
   - Eixo: `Dim_Filial[branch_display_name]`
   - Valor: `Operating Result` (toggle para `Gross Margin %`)
4. **Semaforo alertas** (4 indicadores)
   - CMV, cancelamento, estoque critico, contas vencidas
5. **Waterfall**
   - Receita Bruta -> Descontos -> Receita Liquida -> CMV -> Lucro Bruto -> Resultado Operacional
6. **Tabela de excecoes**
   - Filial, Produto/Conta, Indicador, Valor, Variacao, Impacto
7. **Mini sparklines**
   - Dentro dos cards de KPI primarios
8. **Botoes de navegacao**
   - Vendas, DRE/CMV, Estoque, Financeiro, Operacao por Filial

## 5.2 Proporcao de tela

- Header: 8%
- KPI strips (primario + secundario): 24%
- Blocos analiticos (tendencia/ranking/semaforo/waterfall): 46%
- Excecoes: 22%

# 6. Navegacao e interacoes

## 6.1 Filtros globais (topo)

1. Periodo (`Dim_Calendario`)
2. Filial (`Dim_Filial`)
3. Canal/Tipo pedido (`Fato_Pedidos[order_type]`, `Fato_Pedidos[channel]`)

## 6.2 Interacoes clicaveis

1. Card de KPI -> drill-through para pagina tematica.
2. Barra de filial -> abre pagina de performance da filial.
3. Linha da tabela de excecao -> detalhe operacional/financeiro.
4. Semaforo -> lista filtrada da anomalia correspondente.

## 6.3 Simplicidade para diretoria

- Sem drill em cascata profunda.
- No maximo 1 clique para sair do consolidado e ver causa.
- Tooltip apenas com complemento (nao regra de negocio).

# 7. Storytelling executivo

Sequencia obrigatoria:

1. **Estado geral**: KPI strip primario.
2. **Tendencia**: linha temporal.
3. **Comparacao**: ranking filial.
4. **Risco**: semaforo + chips de risco.
5. **Acao**: tabela de excecoes.

Mensagem central da pagina:
- "Qual o resultado agora, para onde esta indo, e onde agir hoje."

# 8. Estilo visual

Usar o tema atual (`tema_executivo.json`) como base, com semantica:

- Receita: azul (`#1D4ED8`)
- Margem/Lucro: verde (`#16A34A`)
- CMV/risco: vermelho (`#DC2626`)
- Alerta: amarelo/laranja (`#F59E0B`)
- Neutro: cinza (`#64748B`)

Regras visuais:

1. Fundo neutro, cards brancos.
2. Numeros grandes, rotulos curtos.
3. Espaco em branco entre blocos.
4. Nada de redundancia (evitar 2 visuais com mesma leitura).
5. Titulo de bloco sempre em 1 linha, objetivo e padronizado.

# 9. Recomendacao final de implementacao

## 9.1 Ordem de construcao no Power BI (pratica)

1. Aplicar `tema_executivo.json`.
2. Criar pagina `01_Visao_Geral_Executiva`.
3. Montar header com slicers globais.
4. Inserir KPI strip primario.
5. Inserir KPI strip secundario.
6. Inserir tendencia + semaforo.
7. Inserir ranking filial + resumo de status.
8. Inserir waterfall DRE + bloco de excecao.
9. Inserir tabela final de excecoes.
10. Configurar `Edit interactions` para manter navegacao simples.
11. Configurar drill-through para paginas detalhadas.
12. Testar leitura em 5 segundos com usuario executivo.

## 9.2 Mobile-first (sem perder sofisticacao desktop)

Ordem no layout mobile:

1. Receita Liquida
2. Margem Bruta %
3. Resultado Operacional
4. Semaforo de alertas
5. Tendencia temporal
6. Ranking filial
7. Excecoes criticas

Regra mobile:
- manter no maximo 1 visual principal por "dobra" da tela.
