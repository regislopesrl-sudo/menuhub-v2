# Auditoria de replicacao - Sistema de Gestao para MenuHub DEV

Data: 2026-06-02
Escopo: DEV do servidor, sem HML/PRD.

## Fonte auditada

- Aplicacao legada/local: `http://157.180.123.181/sistema-gestao/`
- Documentos locais usados como referencia:
  - `C:\Sistema de Gestão\MENUS_E_LAYOUTS_DAS_PAGINAS.md`
  - `C:\Sistema de Gestão\LIGACOES_DO_SISTEMA.md`
  - `C:\Sistema de Gestão\MENU_INSUMOS.md`

## Mapa de menus

| Sistema de Gestao | MenuHub DEV | Status |
| --- | --- | --- |
| Inicio / Configuracoes | `/admin` | Incorporado: empresa, importacoes, usuarios e limpeza controlada |
| Insumos | `/admin/stock?section=ingredients` | Incorporado: cadastro, custo, fornecedor, estoque e categorias de insumo |
| Producao Interna | `/admin/production` | Incorporado: receitas de insumos, perdas e ordens de producao |
| Ficha Tecnica | `/admin/technical-sheet` e `/admin/technical-sheet/[productId]` | Incorporado: lista geral e pagina individual por produto |
| Produtos | `/admin/menu?tab=products` | Incorporado: catalogo, precos, status, ficha tecnica e baixa |
| Compras | `/admin/procurement` | Incorporado: fornecedores, pedidos, recebimento, fiscal e contas a pagar |
| Vendas | `/admin/orders` e `/admin/reports?view=sales` | Parcial: pedidos reais e BI; falta tela tabular equivalente a `6_vendas` |
| Estoque | `/admin/stock` | Incorporado: ruptura, compra sugerida, saneamento, produtos e insumos |
| Dashboard de Performance | `/admin/reports?view=dashboard` | Incorporado: BI executivo/operacional |
| Eng Cardapio | `/admin/reports?view=menu` | Incorporado: CMV, margem e produtos |
| ABC Insumos | `/admin/reports?view=abc-stock` | Incorporado: curva ABC por compras/entradas |
| ABC Pratos | `/admin/reports?view=abc-products` | Incorporado: curva ABC por vendas |

## Cadeia de dados replicada

O documento `LIGACOES_DO_SISTEMA.md` define a cadeia:

`Insumos -> Producao Interna -> Ficha Tecnica -> Produtos -> Vendas -> Estoque/CMV/Relatorios`

No MenuHub DEV essa cadeia esta distribuida assim:

- `StockItem` e `StockCategory`: base de insumos, produtos controlados, adicionais, unidades, custo medio, saldo e fornecedor.
- `Recipe` e `RecipeItem`: ficha tecnica e receitas de producao.
- `PurchaseOrder`, `PurchaseReceipt`, `PurchaseDocument` e `StockMovement`: compras, recebimento fiscal/manual, custo medio e entrada de estoque.
- `Order`, `OrderItem` e baixa por `StockService.consumeByOrder`: venda para baixa tecnica.
- `ReportsService`: estoque, compra sugerida, CMV, DRE, ABC insumos e ABC produtos.

## Lacunas controladas

- Criar pagina tabular dedicada para `Vendas`, equivalente a `6_vendas`, em vez de depender apenas de pedidos/BI.
- Aproximar mais o visual de Compras e Fornecedores do layout legadao quando houver novo bloco de UI.
- Completar dialogs dedicados para categorias de produto, fornecedores e ficha tecnica no mesmo padrao visual simples do Sistema de Gestao.
- Manter importacao fiscal real como bloco separado, porque depende de provedor/certificado/API externo.

## Regra de continuidade

Cada proximo bloco deve preservar tenant/filial, historico de estoque e financeiro. Exclusoes operacionais devem ser desativacao logica quando houver historico vinculado.
