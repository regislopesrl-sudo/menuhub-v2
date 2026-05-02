# Importacao de relatorio de vendas

## Objetivo

Importar um CSV ou XLSX de outro sistema com vendas dos ultimos 12 meses, gerar preview, validar linhas e persistir os dados em uma base auditavel separada de `orders`.

## Surface canonica

- Backend: `/api/v1/sales-imports`
- Frontend admin: `/reports/importacao-vendas`

## Formato suportado

- CSV com cabecalho
- XLSX/XLS usando a primeira planilha preenchida
- Delimitadores detectados automaticamente: `,`, `;` e `tab`

## Colunas suportadas

O parser tenta reconhecer aliases para os campos abaixo:

- data da venda
- numero do pedido
- id externo
- canal
- cliente
- subtotal
- desconto
- taxa de entrega
- total
- forma de pagamento
- status
- loja ou filial
- observacoes

## Regras de normalizacao

- datas sao convertidas para `ISO`
- valores monetarios aceitam virgula e ponto
- canal e status sao padronizados
- forma de pagamento e padronizada quando reconhecida
- linhas vazias, datas invalidas e totais invalidos entram como erro

## Regra de 12 meses

- a importacao aceita apenas vendas dentro da janela dos ultimos 12 meses
- linhas fora dessa janela ficam com erro no preview
- linhas com data no futuro tambem ficam com erro

## Regra de deduplicacao

Ordem adotada:

1. `externalSaleId`, quando existir
2. `orderNumber + saleDate(yyyy-mm-dd) + totalAmount`

Os dados importados usam `companyId + dedupKey` como chave unica.

## Comportamento de importacao

- modo: `UPSERT`
- vendas novas: `CREATE`
- vendas ja conhecidas pela `dedupKey`: `UPDATE`
- linhas invalidas: `ERROR`

## Auditoria

Cada importacao persiste:

- arquivo bruto
- colunas detectadas
- usuario que importou
- timestamps
- totais de linhas validas e invalidas
- contadores de create, update, skip e error
- erros por linha

## Consulta posterior

O admin consegue consultar:

- historico de importacoes
- detalhe do preview/importacao
- lista das vendas importadas mais recentes

## Integracao com relatorios

As vendas importadas passam a alimentar automaticamente:

- `GET /api/v1/reports/orders`
- `GET /api/v1/reports/sales-period`

Os dados continuam persistidos em `imported_sales` para auditoria e nao sobrescrevem `orders`.

## Limitacoes conhecidas

- o parser de XLSX usa a primeira planilha preenchida do arquivo
- `financial` e outros relatorios operacionais nao mesclam `imported_sales` automaticamente
- as vendas importadas ficam em base separada para evitar regressao no operacional
