# 1. Visao geral da arquitetura do dashboard

Objetivo geral: entregar um dashboard executivo multi-filial com leitura em 5 segundos para diretoria, mantendo profundidade para operacao, financeiro e comercial em 1 clique.

Premissas usadas (fonte de verdade):
- Modelo estrela e medidas DAX ja existentes no projeto.
- Views SQL ja existentes: DRE, CMV, vendas, estoque, financeiro, margem.
- Dimensoes: calendario, filial, produto, cliente e financeiro.
- Fatos: pedidos, itens, estoque, CMV, DRE, margem.
- Campos operacionais do schema: `orders.status`, `orders.order_type`, `orders.channel`, `accounts_receivable.status`, `accounts_payable.status`, `stock_movements.movement_type`.

Arquitetura de paginas recomendada:
1. 01_Visao_Geral_Executiva
2. 02_Vendas_Ticket
3. 03_DRE_CMV
4. 04_Margem_Produto_Mix
5. 05_Estoque_Consumo
6. 06_Financeiro_Caixa
7. 07_Operacao_Filial
8. 08_Alertas_Excecoes

# 2. Estrutura das paginas

## 2.1 01_Visao_Geral_Executiva
Objetivo:
- Mostrar saude geral do negocio agora.

Perguntas respondidas:
- Receita, margem e resultado estao dentro do esperado?
- Qual direcao do resultado no tempo?
- Quais filiais puxam para cima/baixo?
- Ha risco imediato em CMV, cancelamento, estoque ou financeiro?

KPIs principais:
- Receita Bruta
- Receita Liquida
- CMV Real
- Margem Bruta %
- Resultado Operacional
- Ticket Medio
- Total de Pedidos
- Taxa de Cancelamento
- Contas em Aberto

Visuais:
- KPI cards
- Linha temporal
- Ranking horizontal por filial
- Waterfall DRE resumida
- Semaforo de alertas
- Tabela de excecoes

Filtros necessarios:
- Global: Periodo, Filial, Order Type, Channel
- Local: Status do pedido

## 2.2 02_Vendas_Ticket
Objetivo:
- Explicar crescimento/queda de vendas e ticket.

Perguntas respondidas:
- Quais canais e tipos de pedido crescem mais?
- O ticket medio esta subindo por filial/canal?

KPIs principais:
- Receita Bruta
- Receita Liquida
- Ticket Medio
- Total de Pedidos
- Pedidos Finalizados
- Taxa de Cancelamento

Visuais:
- Linha temporal receita/ticket
- Barras por canal e order type
- Heatmap filial x canal
- Top N produtos por receita

Filtros necessarios:
- Global: Periodo, Filial
- Local: Channel, Order Type, Status

## 2.3 03_DRE_CMV
Objetivo:
- Ler resultado operacional e desvio de CMV.

Perguntas respondidas:
- Onde o lucro esta sendo consumido?
- CMV real esta acima do teorico?

KPIs principais:
- Receita Bruta
- Receita Liquida
- CMV Real
- CMV Teorico
- Margem Bruta
- Margem Bruta %
- Resultado Operacional

Visuais:
- Waterfall DRE
- Linhas CMV real x teorico
- Barras por filial
- Matriz conta DRE x periodo

Filtros necessarios:
- Global: Periodo, Filial
- Local: Conta DRE, Categoria de produto

Detalhamento implementavel da pagina:
- `pagina_dre_cmv_executiva.md`

## 2.4 04_Margem_Produto_Mix
Objetivo:
- Mostrar rentabilidade por produto/categoria.

Perguntas respondidas:
- Quais produtos sustentam margem?
- Quais produtos destroem margem?

KPIs principais:
- Margem Bruta por Produto
- Margem Bruta % por Produto
- Receita por Produto
- CMV por Produto
- Produtos com Margem Negativa

Visuais:
- Ranking Top/Bottom N
- Scatter (receita x margem %)
- Matriz categoria > produto
- Tabela de excecoes de margem negativa

Filtros necessarios:
- Global: Periodo, Filial
- Local: Categoria, Produto

Detalhamento implementavel da pagina:
- `pagina_margem_produto_executiva.md`

## 2.5 05_Estoque_Consumo
Objetivo:
- Reduzir ruptura, perda e excesso.

Perguntas respondidas:
- Quais itens estao abaixo do minimo/reorder point?
- Quais movimentos de estoque pressionam custo?

KPIs principais:
- Giro de Estoque
- Itens abaixo do minimo
- Itens em ponto de reposicao
- Perdas de estoque (movements LOSS)
- Consumo de producao

Visuais:
- Barras por categoria de estoque
- Linha temporal de movimentos
- Tabela critica de itens
- Heatmap item x filial (criticidade)

Filtros necessarios:
- Global: Periodo, Filial
- Local: Stock Type, Movement Type, Categoria de estoque

Detalhamento implementavel da pagina:
- `pagina_estoque_consumo_executiva.md`

## 2.6 06_Financeiro_Caixa
Objetivo:
- Controlar liquidez de curto prazo.

Perguntas respondidas:
- Qual volume em aberto no contas a pagar/receber?
- Onde existe risco de inadimplencia e vencimento?

KPIs principais:
- Contas a Receber em Aberto
- Contas a Pagar em Aberto
- Inadimplencia (receber vencido)
- Saldo de Caixa (quando fonte existir no modelo atual)

Visuais:
- Aging em barras (faixas de vencimento)
- Linhas de tendencia AP x AR
- Matriz por status financeiro
- Tabela de titulos criticos

Filtros necessarios:
- Global: Periodo, Filial
- Local: Status financeiro, Cliente, Fornecedor

Detalhamento implementavel da pagina:
- `pagina_financeiro_executiva.md`

## 2.7 07_Operacao_Filial
Objetivo:
- Medir eficiencia operacional por unidade.

Perguntas respondidas:
- Onde estao gargalos no fluxo do pedido?
- Qual filial tem pior desempenho operacional?

KPIs principais:
- Pedidos por status
- Taxa de Cancelamento
- Lead time por etapa (quando medida estiver no modelo)
- Entregas fora da zona (outside_delivery_zone)

Visuais:
- Funil de status de pedido
- Barras por filial
- Linha de volume por hora/dia
- Mapa por filial (se coordenadas disponiveis)

Filtros necessarios:
- Global: Periodo, Filial
- Local: Status, Order Type, Channel

Detalhamento implementavel da pagina:
- `pagina_operacao_performance_filial_executiva.md`

## 2.8 08_Alertas_Excecoes
Objetivo:
- Priorizar acao diaria por impacto.

Perguntas respondidas:
- Quais anomalias exigem acao imediata?
- Qual impacto financeiro estimado de cada excecao?

KPIs principais:
- Alertas CMV
- Alertas de margem negativa
- Filiais com resultado operacional negativo
- Titulos vencidos
- Itens de estoque critico

Visuais:
- Semaforo consolidado
- Tabela de excecoes com ordenacao por impacto
- Cards de contagem de alertas

Filtros necessarios:
- Global: Periodo, Filial
- Local: Tipo de alerta

# 3. KPIs por pagina

Lista consolidada (sem criar metrica fora do contexto):
- Receita Bruta
- Receita Liquida
- CMV Real
- CMV Teorico
- Margem Bruta
- Margem Bruta %
- Resultado Operacional
- Ticket Medio
- Total de Pedidos
- Pedidos Finalizados
- Taxa de Cancelamento
- Giro de Estoque
- Contas em Aberto (AP e AR)
- Inadimplencia
- Produtos com Margem Negativa
- Filiais com Resultado Operacional Negativo

Observacao de consistencia:
- Como nao ha tabela de metas explicita no schema compartilhado, "filiais fora da meta" deve usar proxy operacional/financeiro (ex.: Resultado Operacional < 0) ate existir fonte de meta oficial.

# 4. Visuais recomendados

Mapeamento por necessidade:
- KPI sintetico: Cards/KPI com variacao vs periodo anterior.
- Evolucao no tempo: Line chart com eixo mensal/semanal.
- Comparacao entre filiais/canais: Barra horizontal ordenada.
- Participacao de mix: Donut apenas para baixa cardinalidade (maximo 5-6 categorias).
- Analise detalhada de numeros: Matriz com drill-down.
- Geografia operacional: Mapa por filial/area de entrega (quando coordenadas estiverem disponiveis).
- Fluxo operacional: Funil de status de pedidos.
- Composicao do resultado: Waterfall DRE.
- Intensidade de problema: Heatmap filial x categoria/item.
- Priorizacao comercial/financeira: Top N ranking.
- Tendencia compacta: Sparklines em cards e tabelas.
- Acionamento gerencial: Tabelas de excecao com impacto.

# 5. Storytelling executivo

Narrativa recomendada por pagina executiva:
1. Estado atual (KPI strip): "como estamos agora".
2. Tendencia: "para onde estamos indo".
3. Comparativo: "quem performa melhor/pior".
4. Risco: "o que pode comprometer resultado".
5. Acao: "onde agir hoje".

Mensagem central da home:
- "Resultado consolidado, direcao do negocio e prioridades de acao em um unico painel."

# 6. Filtros e navegacao

Filtros globais (todas as paginas):
- Periodo
- Filial
- Order Type (`DELIVERY`, `COUNTER`, `PICKUP`, `TABLE`, `COMMAND`, `WHATSAPP`, `KIOSK`, `QR`)
- Channel

Filtros locais por pagina:
- Vendas: Categoria, Produto, Status de pedido.
- DRE/CMV: Conta DRE, Categoria.
- Estoque: Stock Type, Movement Type.
- Financeiro: Status financeiro, Cliente, Fornecedor.
- Operacao: Status de pedido, area de entrega.

Filtros ocultos (para simplificar experiencia):
- Chaves tecnicas (ids)
- Campos de auditoria (`created_at`, `updated_at`) quando nao forem a analise principal.
- Campos de texto tecnico que nao agregam decisao executiva.

Navegacao:
- Menu lateral fixo com 8 paginas.
- Cards e rankings clicaveis com drill-through de 1 nivel.
- Botao "voltar ao consolidado" em todas as paginas detalhadas.

# 7. Versao mobile-first

Ordem mobile recomendada (home):
1. Receita Liquida
2. Margem Bruta %
3. Resultado Operacional
4. Semaforo de alertas
5. Tendencia temporal
6. Ranking de filiais
7. Excecoes

Regras mobile:
- Um visual principal por dobra de tela.
- Cards com minimo 44x44 para toque.
- Reduzir matriz para top 5 + botao "ver mais".
- Priorizar cards e barras; evitar excesso de tabela longa.

# 8. Paleta visual e identidade

Paleta corporativa sugerida (executiva e neutra):
- Primaria: `#0F172A`
- Apoio: `#1D4ED8`
- Fundo: `#F8FAFC`
- Texto principal: `#0B1220`
- Texto secundario: `#64748B`

Semantica de status:
- Sucesso: `#16A34A`
- Alerta: `#F59E0B`
- Risco: `#DC2626`
- Neutro: `#94A3B8`

Padrao visual:
- Cards com borda suave e contraste alto de numero.
- Titulos curtos no padrao: "Indicador | contexto".
- Espacamento 8/12/16/24 px.
- Densidade moderada: no maximo 7 visuais principais por pagina.
- Icones apenas para reforco semantico (financeiro, operacao, alerta).

# 9. Recomendacoes finais

Sequencia pratica de implementacao:
1. Publicar tema visual e layout base (desktop + mobile).
2. Implementar pagina 01 (home executiva) e validar leitura em 5 segundos.
3. Implementar paginas 02 a 07 com padrao unico de navegacao.
4. Implementar pagina 08 de alertas com foco em excecao acionavel.
5. Validar performance, consistencia de filtros e regras de interacao.
6. Homologar com diretoria (visao) e gestores (acao).

Checklist de qualidade:
- Uma mensagem principal por pagina.
- Sem duplicidade de visual para a mesma pergunta.
- Cores usadas por semantica de decisao.
- Drill-through simples e previsivel.
- Leitura rapida e clara para diretoria.
