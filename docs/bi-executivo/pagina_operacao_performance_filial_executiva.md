# 1. Objetivo da pagina

A pagina **Operacao e Performance por Filial** deve responder, em leitura executiva:

1. Quais filiais performam melhor e pior.
2. Onde estao os desvios operacionais que impactam receita e margem.
3. Como evoluem volume, ticket e eficiencia no tempo.
4. Quais unidades exigem acao imediata.

Publico-alvo:
- Diretoria
- Operacao
- Gestores regionais
- Franqueados / responsaveis por unidade
- Controladoria

# 2. Estrutura visual sugerida

Leitura ideal: **performance -> desvio -> gargalo -> canal/horario -> acao**.

```text
+--------------------------------------------------------------------------------------------------+
| TITULO: Operacao e Performance por Filial | Ultimo refresh | Periodo | Filial | Canal | Tipo   |
|                                           | Status pedido | Faixa horario | Regiao              |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP: Receita | Pedidos | Ticket Medio | Margem Bruta | Resultado Operacional              |
|            Cancelamento % | Finalizacao % | Prep Time (min) | Delivery Time (min)               |
|            Orders per Hour | Operational Productivity                                           |
+------------------------------------------------------+-------------------------------------------+
| Ranking de filiais (6 col)                          | Semaforo de performance (6 col)          |
| melhor -> pior por Performance by Branch            | score consolidado por unidade            |
+------------------------------------------------------+-------------------------------------------+
| Evolucao temporal (8 col)                           | Dispersao eficiencia (4 col)             |
| Receita, pedidos, cancelamento, finalizacao         | X=Prep Time, Y=Produtividade, size=pedidos |
+------------------------------------------------------+-------------------------------------------+
| Comparativo canal x filial (6 col)                  | Tipo pedido x filial (6 col)             |
| barras horizontais/matriz                            | delivery/pickup/table/command etc.       |
+--------------------------------------------------------------------------------------------------+
| Heatmap produtividade (12 col): filial x faixa de horario (Orders per Hour / Productivity)      |
+--------------------------------------------------------------------------------------------------+
| Tabela de excecoes (12 col): filial | indicador | valor | limite | desvio | prioridade          |
+--------------------------------------------------------------------------------------------------+
```

Ordem de leitura:
1. KPI strip para fotografia da operacao.
2. Ranking para localizar melhores e piores unidades.
3. Tendencia e eficiencia para entender causa.
4. Canais e horarios para detalhar gargalo.
5. Excecoes para plano de acao.

# 3. KPIs principais

Mapeamento para medidas/campos ja existentes:

1. **Receita por filial** -> `Net Revenue` por `branch_id`
2. **Numero de pedidos por filial** -> `Orders by Branch`
3. **Ticket medio** -> `Average Ticket`
4. **Margem bruta por filial** -> `Gross Margin`
5. **Resultado operacional por filial** -> `Operating Result`
6. **Taxa de cancelamento** -> `Cancellation Rate %`
7. **Taxa de finalizacao** -> `Finalization Rate %`
8. **Tempo medio de preparo** -> `Average Prep Time (min)`
9. **Tempo medio de entrega** -> `Average Delivery Time (min)` (ou `Average Time to Delivery (min)` para porta a porta)
10. **Pedidos por hora** -> `Orders per Hour`
11. **Produtividade operacional** -> `Operational Productivity`

Indicador sintetico sugerido:
- `Performance by Branch` como score de comparacao entre unidades.

Campos de suporte no schema (fonte de verdade):
- `orders.branchId`, `orders.channel`, `orders.orderType`, `orders.status`
- `orders.confirmedAt`, `orders.preparationStartedAt`, `orders.readyAt`
- `orders.dispatchedAt`, `orders.deliveredAt`, `orders.finalizedAt`, `orders.canceledAt`
- `orders.outsideDeliveryZone`, `orders.deliveryDurationSec`
- `branches.name`, `branches.code`, `branches.city`, `branches.state`, `branches.isActive`

# 4. Visuais recomendados

Visuais principais:

1. **Cards KPI** para topo executivo.
2. **Ranking de filiais** (Top/Bottom) com barras horizontais.
3. **Linha temporal** para evolucao de receita, pedidos e taxas.
4. **Matriz por filial** com KPIs operacionais.
5. **Mapa por regiao** (opcional) usando `branches.city/state` como geografia.
6. **Tabela de excecoes** para desvios criticos.
7. **Heatmap de produtividade** por filial x horario.
8. **Semaforo** para status operacional por unidade.
9. **Scatter de eficiencia** para tempo vs produtividade.

Analises comparativas que os visuais devem suportar:

1. **Filial vs filial**: ranking por `Performance by Branch`.
2. **Filial vs meta**: usar parametro de limite gerencial (na ausencia de tabela de meta).
3. **Periodo atual vs anterior**: comparacao temporal (MoM/YoY onde aplicavel).
4. **Canal por filial**: `orders.channel`.
5. **Tipo de pedido por filial**: `orders.orderType`.
6. **Faixa de horario**: bucket de `order_datetime_ref` / horario do pedido.
7. **Impacto de cancelamento e atraso**: cruzar `Cancellation Rate %`, `Average Prep Time (min)` e `Average Delivery Time (min)`.

# 5. Storytelling executivo

Narrativa recomendada:

1. Mostrar quem esta performando melhor e pior entre as filiais.
2. Mostrar os principais desvios operacionais.
3. Mostrar gargalos de tempo e produtividade.
4. Mostrar canais e horarios criticos.
5. Encerrar com alertas acionaveis por unidade.

Mensagem central:
- "Quais filiais entregam resultado com eficiencia e quais exigem intervencao operacional imediata."

# 6. Filtros e segmentacoes

## 6.1 Globais

1. Periodo
2. Filial
3. Canal (`orders.channel`)
4. Tipo de pedido (`orders.orderType`)
5. Regiao (proxy por `branches.state` e `branches.city`)

## 6.2 Locais

1. Status do pedido (`orders.status`)
2. Faixa de horario (bucket de hora)
3. Status operacional (agrupamento derivado de `OrderStatus`)

## 6.3 Inconsistencias e ajuste minimo

1. **Filial vs meta**: nao ha tabela de meta no schema compartilhado.
   - Ajuste minimo: usar parametro de meta no Power BI (what-if/threshold).
2. **Gerente responsavel**: nao existe relacionamento oficial de gerente por filial no schema.
   - Ajuste minimo: manter slicer oculto/desabilitado ate existir dimensao oficial.

# 7. Alertas e excecoes

Destacar automaticamente:

1. **Filial com receita abaixo da meta** (limite parametrico).
2. **Ticket medio abaixo do esperado**.
3. **Cancelamento acima do limite** (`Cancellation Rate %`).
4. **Fila operacional alta** (pedidos em estados intermediarios acima do padrao).
5. **Atraso medio acima do padrao** (`Average Prep Time (min)` / `Average Delivery Time (min)`).
6. **Produtividade abaixo da media** (`Operational Productivity`).
7. **Queda brusca de desempenho** (variacao negativa relevante vs periodo anterior).
8. **Filial fora do padrao de margem** (`Gross Margin %` abaixo do limite).

Prioridade:
- Critico: vermelho, acao imediata.
- Atencao: amarelo, monitoramento curto prazo.
- Controlado: verde.

# 8. Padrao visual

Paleta recomendada:
- Alta performance: `#16A34A`
- Atencao: `#F59E0B`
- Critica: `#DC2626`
- Base executiva: `#1D4ED8`
- Neutro: `#64748B`

Regras de design:

1. Titulos curtos e orientados a decisao.
2. Densidade moderada (evitar excesso de mini-graficos).
3. Hierarquia fixa: KPI -> comparativo -> causa -> excecao.
4. Uso de icones e semaforos apenas para risco e prioridade.
5. Consistencia visual com paginas de DRE, Margem, Estoque e Financeiro.

Mobile-first:
- Sequencia: KPI -> ranking -> semaforo -> tendencia -> excecoes.
- Alvos de toque minimos de 44x44 px.

# 9. Recomendacao final de implementacao

Sequencia pratica no Power BI:

1. Criar pagina `07_Operacao_Filial`.
2. Montar KPI strip com 11 indicadores operacionais.
3. Inserir ranking Top/Bottom de filiais.
4. Inserir linha temporal e scatter de eficiencia.
5. Inserir blocos de canal/tipo de pedido e heatmap horario.
6. Inserir tabela de excecoes com prioridade.
7. Configurar semaforo com thresholds de performance.
8. Validar interacoes de filtros globais e locais.

Checklist de aceite:
- Performance por filial entendida em segundos.
- Desvios operacionais visiveis e acionaveis.
- Gargalos por canal e horario claramente identificados.
- Leitura executiva limpa no desktop e no mobile.
