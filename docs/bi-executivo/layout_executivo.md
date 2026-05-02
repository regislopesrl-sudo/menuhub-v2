# Layout Executivo

Guia de estrutura visual para o dashboard executivo no Power BI, com foco em DRE simplificada, CMV real vs teorico e Ticket Medio.

## Objetivo da pagina

A tela principal precisa responder em poucos segundos:

1. Quanto vendemos?
2. Quanto custou para vender?
3. Quanto sobrou?

Se o usuario nao enxergar isso em 3 segundos, a pagina esta detalhada demais.

## Modelo analitico recomendado

- Importar o modelo estrela das views:
  - `vw_fato_pedidos`
  - `vw_fato_itens_pedido`
  - `vw_fato_kardex`
  - `vw_fato_financeiro`
  - `vw_dre_mensal`
  - `vw_cmv_mensal`
  - `vw_margem_produto`
  - `vw_resultado_operacional`
  - `vw_dim_calendario`
  - `vw_dim_filial`
  - `vw_dim_produto`
  - `vw_dim_cliente`
  - `vw_dim_conta_financeira`
- Relacionamentos em direcao unica, da dimensao para os fatos.
- Detalhamento da arquitetura em: `modelo_estrela_powerbi.md`.

## Wireframe logico

```text
+----------------------------------------------------------------------------------+
| TITULO: DRE EXECUTIVA | periodo | filial | canal | ultimo refresh                 |
+------------------------------- KPI STRIP ----------------------------------------+
| Receita Bruta | Receita Liquida | CMV Total | Lucro Bruto | Margem Bruta % | TM   |
+-----------------------------+--------------------------------+-------------------+
| Waterfall DRE               | Linha: Receita, CMV e Margem   | CMV Real vs Teorico|
| (Receita -> descontos ->    | por mes                        | por mes/filial     |
|  CMV -> Lucro)              |                                |                   |
+-----------------------------+--------------------------------+-------------------+
| Matriz por filial           | Top produtos / mix / alertas   | Observacoes       |
| Receita | CMV | Lucro |     | Categoria | Receita | CMV      | excecoes         |
| Margem   | Ticket            |                                |                   |
+----------------------------------------------------------------------------------+
```

## Prioridade dos visuais

### 1. Faixa de KPI

- Mostre 5 a 6 cards no topo.
- Ordem sugerida: Receita Bruta, Receita Liquida, CMV Total, Lucro Bruto, Margem Bruta %, Ticket Medio.
- Cada card deve ter:
  - valor principal
  - variacao vs periodo anterior
  - mini sparkline, se houver espaco

### 2. Waterfall da DRE

Use um waterfall com a narrativa:

1. Receita Bruta
2. Descontos Comerciais
3. Ajustes de Receita
4. CMV Total
5. Lucro Bruto

Esse visual e o melhor candidato para a leitura imediata do resultado.

### 3. Tendencia mensal

Use um combo chart ou line chart com:

- Receita Liquida
- CMV Total
- Lucro Bruto
- Margem Bruta %

Objetivo: mostrar se a operacao esta melhorando ou piorando ao longo do tempo.

### 4. Comparativo CMV real vs teorico

O visual deve responder:

- O CMV real esta acima ou abaixo do teorico?
- Em quais meses ou filiais o gap aumentou?

Sugestao:

- colunas agrupadas para `CMV Total` e `CMV Teorico`
- linha para `Desvio CMV`

### 5. Matriz por filial

Exiba:

- Receita Bruta
- Receita Liquida
- CMV Total
- Lucro Bruto
- Margem Bruta %
- Ticket Medio

Ordene por Lucro Bruto ou Margem Bruta %.

### 6. Bloco diagnostico

Na parte inferior, mostre:

- Top 10 produtos por receita
- Top 10 produtos por CMV
- Alertas de margem negativa
- Filiais com maior perda

## Diretrizes de data storytelling

- Uma pagina, uma historia.
- Primeiro conte o resultado, depois explique o motivo.
- Nao misture mais de um tema principal por bloco.
- Use comparacao com periodo anterior e meta sempre que possivel.
- Destaque a excecao, nao o ruido.

## Cores semanticas

Use cores por significado, nao por decoracao:

- Receita: azul
- Receita Liquida: azul escuro ou ciano
- CMV: vermelho
- Lucro Bruto: verde
- Margem Bruta %: verde escuro
- Alertas: amarelo/laranja
- Neutro: cinza

Regras:

- Verde = bom
- Vermelho = ruim
- Cinza = contexto
- Evite roxo e degradens pesados em cards executivos

## Regras de UX

- Fundo limpo e neutro.
- Numeros grandes, texto pequeno.
- Margens generosas.
- Apenas uma acao principal por visual.
- Evite mais de 7 visuais na mesma pagina.
- Slicers compactos e no topo.
- Use tooltips para detalhes, nao para explicacao basica.

## Formato dos numeros

- Moeda em BRL.
- Percentual com 1 ou 2 casas.
- Ticket Medio com 2 casas.
- CMV e Lucro em valor absoluto e percentual quando relevante.

## Ajustes uteis

- Ordene `MesNome` por `MesNumero`.
- Ordene `DiaSemanaNome` por `DiaSemanaNumero`.
- Marque `Dim_Calendario` como tabela de datas.
- Desative auto date/time no modelo.
- Use filtro de periodo padrao de 12 meses para a visao executiva.

## Observacao sobre dados

- O schema atual expoe `cancellation_reason` como texto, entao nao existe um campo numerico de devolucao.
- O modelo acima deixa `refund_amount` preparado no fato de vendas, mas ele fica em zero ate haver uma fonte monetaria real de estorno.
- Movimentos de perda sem filial definida caem na chave sintetica `Sem filial` para nao sumirem dos indicadores.
- Taxas de entrega e extras ficam como contexto operacional; a DRE simplificada foca a margem do core de vendas.

## Resultado esperado da pagina

Ao abrir o dashboard, o diretor deve conseguir ler em segundos:

- receita do periodo
- custo real do periodo
- lucro bruto do periodo
- margem bruta
- ticket medio
- diferenca entre CMV real e teorico

Se esses cinco pontos estiverem claros, a pagina esta cumprindo seu papel.
