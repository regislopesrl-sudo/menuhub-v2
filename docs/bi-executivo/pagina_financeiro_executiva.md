# 1. Objetivo da pagina

A pagina **Financeiro** deve responder, de forma executiva:

1. Posicao atual de liquidez (contas a receber, contas a pagar e saldo).
2. Fluxo de entradas e saidas no periodo.
3. Pressao de curto prazo (vencidos, a vencer e inadimplencia).
4. Risco por filial e prioridades de acao.

Publico-alvo:
- Diretoria
- Financeiro
- Controladoria
- Gestores de operacao

# 2. Estrutura visual sugerida

Leitura ideal: **posicao atual -> fluxo -> vencimentos -> risco -> acao**.

```text
+--------------------------------------------------------------------------------------------------+
| TITULO: Financeiro Executivo | Ultimo refresh | Periodo | Filial | Tipo de conta | Status       |
+--------------------------------------------------------------------------------------------------+
| KPI STRIP: Total a Receber | Total a Pagar | Saldo Financeiro | Recebimentos | Pagamentos      |
|            Contas Vencidas | Contas em Aberto | Inadimplencia | Saldo Projetado | Variacao Caixa |
+------------------------------------------------------+-------------------------------------------+
| Fluxo temporal (8 col)                               | Semaforo de saldo (4 col)               |
| Entradas x Saidas x Saldo                            | indicador verde/amarelo/vermelho        |
+------------------------------------------------------+-------------------------------------------+
| Aging de vencimentos (6 col)                         | Ranking de risco por filial (6 col)     |
| vencido, 0-7, 8-30, 31+ dias                         | filial com maior pressao financeira      |
+------------------------------------------------------+-------------------------------------------+
| Waterfall de composicao (6 col)                      | Receber vs Pagar (6 col)                |
| Receber -> Pagar -> Saldo                            | barras horizontais comparativas          |
+--------------------------------------------------------------------------------------------------+
| Matriz de titulos em aberto (12 col): tipo | status | dueDate | amount | filial | cliente/forn |
+--------------------------------------------------------------------------------------------------+
| Tabela de excecoes (12 col): alerta | filial | titulo | valor | dias atraso | prioridade       |
+--------------------------------------------------------------------------------------------------+
```

Ordem de leitura:
1. KPI strip para resposta imediata.
2. Fluxo temporal para tendencia.
3. Aging para compromissos futuros.
4. Ranking por filial para risco.
5. Excecoes para execucao.

# 3. KPIs principais

KPIs de topo (usando medidas/views ja preparadas):

1. **Total a receber** -> `Accounts Receivable`
2. **Total a pagar** -> `Accounts Payable`
3. **Saldo financeiro** -> `Financial Balance`
4. **Recebimentos do periodo** -> `Receipts Period`
5. **Pagamentos do periodo** -> `Payments Period`
6. **Contas vencidas** -> `Default Amount`
7. **Contas em aberto** -> soma de titulos com `status` em aberto
8. **Inadimplencia** -> `Default %`
9. **Saldo projetado** -> `Financial Balance + Receipts Period (Due Date) - Payments Period (Due Date)`
10. **Variacao de caixa** -> `Receipts Period - Payments Period`

Mapeamento ao schema (fonte de verdade):
- Receber: `accounts_receivable.amount`, `accounts_receivable.dueDate`, `accounts_receivable.status`, `accounts_receivable.branchId`
- Pagar: `accounts_payable.amount`, `accounts_payable.dueDate`, `accounts_payable.status`, `accounts_payable.branchId`
- Caixa: `cash_registers.openingBalance`, `cash_registers.closingBalance`, `cash_movements.amount`, `cash_movements.movementType`, `cash_movements.createdAt`

Observacoes de consistencia (ajuste minimo):
- Nao existe enum oficial para status financeiro em AR/AP (campo `status` e string). Padronizar na view financeira.
- Nao existe fato unico de previsao. Projetado deve usar `dueDate` como proxy gerencial.

# 4. Visuais recomendados

1. **Cards KPI**: fotografia da liquidez.
2. **Linha temporal**: entradas, saidas e saldo no tempo.
3. **Waterfall**: impacto de receber/pagar no saldo.
4. **Barras horizontais**: ranking de risco por filial.
5. **Matriz por vencimento**: detalhe por faixa de atraso.
6. **Tabela de excecoes**: titulos criticos para cobranca/negociacao.
7. **Aging chart**: vencidos vs a vencer por faixa.
8. **Ranking por filial**: saldo e inadimplencia.
9. **Indicador de saldo**: leitura rapida (gauge/card).
10. **Semaforo financeiro**: status consolidado do risco.

# 5. Storytelling executivo

Narrativa recomendada:

1. Mostrar a posicao financeira atual.
2. Mostrar composicao de entradas e saidas.
3. Mostrar vencimentos e compromissos futuros.
4. Mostrar atrasos e risco de inadimplencia.
5. Encerrar com alertas por filial e lista de acao.

Mensagem de diretoria:
- "Qual o risco financeiro imediato, onde ele esta concentrado e qual acao priorizar hoje."

# 6. Filtros e segmentacoes

## 6.1 Globais

1. Periodo
2. Filial (`branchId`)
3. Tipo de conta (Receber/Pagar via origem da view financeira)
4. Status do titulo (`accounts_receivable.status`, `accounts_payable.status`)
5. Tipo de movimentacao de caixa (`cash_movements.movementType`) quando bloco de caixa estiver ativo

## 6.2 Locais

1. Cliente (somente contas a receber, `accounts_receivable.customerId`)
2. Fornecedor (somente contas a pagar, `accounts_payable.supplierId`)
3. Canal (somente receber vinculado a pedido por `accounts_receivable.orderId -> orders.channel`)
4. Faixa de vencimento (bucket derivado de `dueDate`)
5. Categoria de movimento de caixa (`cash_movements.category`)

Regra de aplicacao:
- `Periodo` e `Filial` devem ser globais.
- `Cliente/Fornecedor`, `Canal` e `Faixa de vencimento` devem ser locais para evitar leituras distorcidas.

# 7. Alertas e excecoes

Destacar automaticamente:

1. **Saldo negativo** (`Financial Balance < 0`)
2. **Contas vencidas acima do limite** (`Default Amount` acima do threshold)
3. **Aumento anormal de contas a pagar** (delta vs media historica)
4. **Inadimplencia elevada** (`Default %` acima do limite)
5. **Concentracao de recebiveis em poucos clientes** (alto percentual em top clientes)
6. **Divergencia previsao x realizado** (dueDate vs realizado do periodo)
7. **Filial com caixa abaixo do minimo** (proxy por saldo financeiro filial)

Prioridade visual:
- Critico: vermelho (acao imediata)
- Atencao: amarelo (acao em curto prazo)
- Controlado: verde

# 8. Padrao visual

Paleta executiva:
- Positivo: `#16A34A`
- Atencao: `#F59E0B`
- Critico: `#DC2626`
- Financeiro base: `#1D4ED8`
- Neutro: `#64748B`

Padrao de design:
1. Titulos curtos e orientados a decisao.
2. Numeros monetarios com padrao unico (`R$`, milhar e 2 casas).
3. Densidade moderada (maximo 6-7 visuais principais).
4. Hierarquia clara: KPI > tendencia > risco > excecao.
5. Icones e semaforos apenas nos blocos de risco.

Mobile-first:
- Sequencia: KPI -> semaforo -> fluxo -> aging -> excecoes.
- Area de toque minima: 44x44 px.

# 9. Recomendacao final de implementacao

Sequencia de implementacao no Power BI:

1. Criar pagina `06_Financeiro_Caixa` no layout padrao executivo.
2. Montar KPI strip com validacao de medidas e formatacao.
3. Inserir linha temporal de entradas/saidas/saldo.
4. Inserir aging e comparativo receber vs pagar.
5. Inserir ranking de risco por filial.
6. Inserir matriz de titulos em aberto e tabela de excecoes.
7. Aplicar semaforo financeiro e regras de alertas.
8. Validar interacoes (filtros globais x locais) e mobile.

Checklist de aceite:
- Leitura da posicao financeira em menos de 10 segundos.
- Riscos e vencimentos destacados sem ambiguidade.
- Alertas acionaveis por filial e titulo.
- Coerencia entre realizado (periodo) e projetado (vencimento).
