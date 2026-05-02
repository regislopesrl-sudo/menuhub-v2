# 1. Objetivo da pagina

A pagina **DRE e CMV** deve responder, em poucos segundos:

1. Quanto o negocio faturou (receita bruta e liquida).
2. Quanto custou para gerar essa receita (CMV teorico e CMV real).
3. Quanto sobrou (margem bruta e resultado operacional).
4. Onde esta o desvio (tempo, filial e mix).

Publico-alvo:
- Diretoria
- Financeiro
- Controladoria
- Gestao de operacao

# 2. Estrutura visual sugerida

Leitura recomendada: **esquerda para direita, topo para base**.

```text
+--------------------------------------------------------------------------------------------------+
| TITULO: DRE e CMV Executivo | Ultimo refresh | Periodo | Filial | Canal | Tipo pedido | Status  |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP (9 cards): Receita Bruta | Receita Liquida | CMV Teorico | CMV Real | Margem Bruta   |
|                 Margem Bruta % | Resultado Operacional | Resultado Operacional % | Variacao CMV   |
+------------------------------------------------------+-------------------------------------------+
| Tendencia DRE mensal (8 col)                         | Variancia CMV (4 col)                    |
| Receita Liquida, CMV Real, Margem Bruta,            | Real vs Teorico (R$ e p.p.)              |
| Resultado Operacional                                 |                                           |
+--------------------------------------+---------------+-------------------------------------------+
| Waterfall DRE (6 col)                | Ranking filiais (6 col)                                  |
| Receita Bruta -> Liquida -> CMV      | Piores por Resultado Operacional e Desvio CMV            |
| -> Margem Bruta -> Resultado         |                                                           |
+--------------------------------------------------------------------------------------------------+
| Matriz por filial (12 col): Receita | CMV Teorico | CMV Real | Margem % | Resultado % | Desvio  |
+--------------------------------------------------------------------------------------------------+
| Tabela de excecoes e alertas (12 col): tipo alerta | filial | periodo | valor | impacto  |
+--------------------------------------------------------------------------------------------------+
```

Blocos e funcao:
1. **KPI strip**: fotografia executiva do periodo.
2. **Tendencia DRE**: direcao do resultado.
3. **Variancia CMV**: causa de pressao na margem.
4. **Waterfall**: decomposicao gerencial do resultado.
5. **Ranking + Matriz**: comparacao entre filiais.
6. **Excecoes**: priorizacao de acao.

# 3. KPIs principais

Usar medidas ja existentes no projeto (sem criar campo novo):

1. **Receita Bruta** -> `Receita Bruta` (`Gross Revenue`)
2. **Receita Liquida** -> `Receita Liquida` (`Net Revenue`)
3. **CMV Teorico** -> `CMV Teorico` (`CMV Theoretical`)
4. **CMV Real** -> `CMV Total` ou `CMV Real` (conforme pacote adotado)
5. **Margem Bruta (R$)** -> `Lucro Bruto` ou `Gross Margin`
6. **Margem Bruta (%)** -> `Margem Bruta %` (`Gross Margin %`)
7. **Resultado Operacional (R$)** -> `Resultado Operacional` (`Operating Result`)
8. **Resultado Operacional (%)** -> `Margem Operacional %` ou `Operating Result %`
9. **Variacao CMV Teorico x Real** -> `Desvio CMV` ou `CMV Divergence (Real - Theoretical)`

Padronizacao recomendada:
- Exibir KPIs em **R$** e **%** (quando aplicavel).
- Sempre trazer **vs periodo anterior** para leitura gerencial.

# 4. Visuais recomendados

1. **Cards KPI**: os 9 KPIs no topo.
2. **Linha temporal**: evolucao mensal de Receita Liquida, CMV Real, Margem Bruta e Resultado Operacional.
3. **Waterfall**: Receita Bruta -> Descontos -> Receita Liquida -> CMV Real -> Margem Bruta -> Resultado Operacional.
4. **Barras horizontais**: ranking de filiais (pior para melhor).
5. **Matriz por filial**: comparativo completo de DRE/CMV.
6. **Grafico de variancia**: desvio CMV por mes e filial.
7. **Tabela de alertas**: excecoes por impacto.
8. **Top N**: filiais com maior desvio e produtos com pior margem (quando filtro de produto for aplicado).
9. **Slicers**: periodo e filial sempre visiveis no cabecalho.

# 5. Storytelling executivo

Sequencia narrativa recomendada:

1. **Resultado geral**: KPI strip (o que aconteceu).
2. **Composicao da margem**: waterfall DRE (por que aconteceu).
3. **Desvio de CMV**: teorico vs real (onde perdeu eficiencia).
4. **Comparacao entre filiais**: ranking e matriz (quem esta pressionando resultado).
5. **Alertas e oportunidades**: tabela final com priorizacao acionavel (o que fazer agora).

Mensagem central:
- "O resultado caiu/subiu por variacao de receita, custo (CMV) ou despesa operacional."

# 6. Filtros e segmentacoes

## 6.1 Globais (fixos no topo)

1. **Periodo** (`Dim_Calendario`)
2. **Filial** (`Dim_Filial`)
3. **Canal** (`orders.channel`)
4. **Tipo de pedido** (`orders.order_type`)

## 6.2 Locais (blocos especificos)

1. **Status do pedido** (`orders.status`) para analises de qualidade do resultado.
2. **Categoria do produto** (`ProductCategory`) para leitura de mix/margem.
3. **Status financeiro** (`accounts_receivable.status`, `accounts_payable.status`) para conciliacao de resultado e caixa.

## 6.3 Regras de simplicidade

- Globais sempre visiveis.
- Locais so nos blocos de diagnostico.
- Evitar slicer tecnico com IDs.

# 7. Alertas e excecoes

Destacar no bloco de alertas:

1. **Margem negativa**: `Margem Bruta % < 0`
2. **CMV acima da referencia**: `CMV Real > CMV Teorico`
3. **Queda brusca de margem**: variacao % mensal abaixo do limite definido pela controladoria
4. **Filial com custo fora do padrao**: desvio CMV acima da media da rede
5. **Divergencia de consumo teorico vs real**: desvio recorrente por periodo/filial
6. **Resultado operacional negativo**: `Resultado Operacional < 0`

Observacao de consistencia:
- Nao ha tabela de meta explicita no schema compartilhado.
- Para "CMV acima da meta", usar **CMV Teorico como baseline gerencial** (menor alteracao possivel).

# 8. Padrao visual

Paleta recomendada:
- Receita: `#1D4ED8`
- Margem/Resultado positivo: `#16A34A`
- CMV/Desvio negativo: `#DC2626`
- Alerta: `#F59E0B`
- Neutro: `#64748B`

Regras visuais:
1. **CMV Teorico**: linha tracejada / neutra.
2. **CMV Real**: linha solida / cor de risco.
3. Titulos curtos e objetivos.
4. Poucos visuais, tamanho maior, foco executivo.
5. Icones e semaforo apenas em alertas criticos.

Mobile-first:
- Ordem na tela pequena: KPIs -> variancia CMV -> tendencia -> ranking filial -> alertas.

# 9. Recomendacao final de implementacao

Sequencia pratica no Power BI:

1. Criar pagina `03_DRE_CMV` com template visual executivo.
2. Inserir KPI strip e validar formatacao de moeda/percentual.
3. Montar tendencia temporal e bloco de variancia CMV.
4. Montar waterfall DRE e ranking por filial.
5. Montar matriz comparativa por filial.
6. Inserir tabela de excecoes com ordenacao por impacto.
7. Configurar interacoes (1 clique para drill-through).
8. Validar leitura em 5 segundos com diretoria e controladoria.

Criterio de aceite da pagina:
- Diferenciacao clara entre **CMV Teorico** e **CMV Real**.
- Desvios visiveis imediatamente.
- Acao gerencial objetiva em no maximo 1 clique.
