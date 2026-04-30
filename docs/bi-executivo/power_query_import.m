section ExecutiveBI;

// Reference script for the Power BI executive model.
// Before importing the queries, publish the views with `npm run bi:sync`.
// If you are using Power BI Desktop only, use this file as the source for the
// function/query formulas described in `configuracao_power_bi.md`.

// Centralized PostgreSQL connection settings.
shared BI_Exec_Config = [
    Server = "127.0.0.1:5434",
    Database = "sistema_delivery_futuro",
    Schema = "public"
];

// Loads a PostgreSQL view and returns a table.
shared fnLoadView = (viewName as text) as table =>
let
    Source = PostgreSQL.Database(
        BI_Exec_Config[Server],
        BI_Exec_Config[Database],
        [CreateNavigationProperties = false]
    ),
    Quote = Character.FromNumber(34),
    Sql =
        "select * from "
        & Quote
        & BI_Exec_Config[Schema]
        & Quote
        & "."
        & Quote
        & viewName
        & Quote,
    Data = Value.NativeQuery(Source, Sql, null, [EnableFolding = true])
in
    Data;

// Star-schema entities (recommended semantic names).
shared Dim_Calendario = fnLoadView("vw_dim_calendario");
shared Dim_Filial = fnLoadView("vw_dim_filial");
shared Dim_Produto = fnLoadView("vw_dim_produto");
shared Dim_Cliente = fnLoadView("vw_dim_cliente");
shared Dim_Conta_Financeira = fnLoadView("vw_dim_conta_financeira");

shared Fato_Pedidos = fnLoadView("vw_fato_pedidos");
shared Fato_Itens_Pedido = fnLoadView("vw_fato_itens_pedido");
shared Fato_Kardex = fnLoadView("vw_fato_kardex");
shared Fato_Financeiro = fnLoadView("vw_fato_financeiro");
shared Fato_DRE_Mensal = fnLoadView("vw_dre_mensal");
shared Fato_CMV_Mensal = fnLoadView("vw_cmv_mensal");
shared Fato_Margem_Produto = fnLoadView("vw_margem_produto");
shared Fato_Resultado_Operacional = fnLoadView("vw_resultado_operacional");

// Compatibility entities for existing reports.
shared Fato_Vendas = fnLoadView("vw_fato_vendas");
shared Fato_CMV = fnLoadView("vw_fato_cmv");
shared Dim_Produtos = fnLoadView("vw_dim_produtos");
