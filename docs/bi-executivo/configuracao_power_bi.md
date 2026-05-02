# Configuracao do Power BI

Este setup substitui o `pbix` legado da raiz. A ideia e montar um arquivo novo no Power BI Desktop, sempre a partir das views publicadas no PostgreSQL e dos artefatos versionados em `docs/bi-executivo`.

## 1. Arquivos de referencia

- `views_extracao.sql`: camada analitica publicada no banco.
- `power_query_import.m`: referencia das consultas M.
- `modelo_estrela_powerbi.md`: relacionamentos do modelo.
- `medidas_principais.dax`: medidas base.
- `medidas_executivas_operacionais.dax`: medidas executivas e operacionais.
- `tema_executivo.json`: tema visual.

## 2. Pre-requisitos

No ambiente local padrao deste projeto:

- PostgreSQL: `127.0.0.1:5434`
- Banco: `sistema_delivery_futuro`
- Schema: `public`
- Usuario: `postgres`
- Senha: `postgres`

Se o banco nao estiver no ar, suba a stack local primeiro:

```bash
npm run docker:up
```

## 3. Publicar a camada de BI no banco

Comandos disponiveis no repositório:

```bash
npm run bi:sync
npm run bi:check
npm run bi:seed-demo
```

Fluxo esperado:

1. `npm run bi:sync` cria primeiro a camada de compatibilidade do schema Prisma atual e depois aplica o SQL analitico mais atual de `docs/bi-executivo/views_extracao.sql`.
2. `npm run bi:check` valida conectividade e confirma que as views esperadas existem.
3. `npm run bi:seed-demo` gera uma massa de demonstracao para pedidos finalizados, financeiro e CMV, util quando o Power BI ainda esta vazio no ambiente local.

Observacao:
- Se `bi:check` falhar com erro de conexao, o PostgreSQL ainda nao esta acessivel em `127.0.0.1:5434`.
- No banco atual do projeto, as tabelas transacionais estao em `PascalCase` (`"Order"`, `"Product"`, `"Customer"`). O comando `bi:sync` resolve isso criando views auxiliares em `snake_case` antes de publicar a camada de BI.

## 4. Criar o arquivo Power BI do zero

1. Abra o Power BI Desktop.
2. Crie um arquivo novo em branco.
3. Aplique o tema `tema_executivo.json`.
4. Desative `Auto Date/Time` nas opcoes do arquivo.

## 5. Importar as consultas Power Query

O arquivo `power_query_import.m` deve ser usado como referencia das consultas. No Power BI Desktop, o caminho mais seguro e criar:

### 5.1 Consulta funcao `fnLoadView`

Crie uma `Consulta nula` e cole no Editor avancado:

```powerquery
(viewName as text) as table =>
let
    Source = PostgreSQL.Database(
        "127.0.0.1:5434",
        "sistema_delivery_futuro",
        [CreateNavigationProperties = false]
    ),
    Quote = Character.FromNumber(34),
    Sql =
        "select * from "
        & Quote & "public" & Quote
        & "."
        & Quote & viewName & Quote,
    Data = Value.NativeQuery(Source, Sql, null, [EnableFolding = true])
in
    Data
```

### 5.2 Consultas das tabelas

Depois, crie consultas em branco com os nomes abaixo, sempre chamando `fnLoadView("<nome_da_view>")`:

- `Dim_Calendario` -> `vw_dim_calendario`
- `Dim_Filial` -> `vw_dim_filial`
- `Dim_Produto` -> `vw_dim_produto`
- `Dim_Cliente` -> `vw_dim_cliente`
- `Dim_Conta_Financeira` -> `vw_dim_conta_financeira`
- `Fato_Pedidos` -> `vw_fato_pedidos`
- `Fato_Itens_Pedido` -> `vw_fato_itens_pedido`
- `Fato_Kardex` -> `vw_fato_kardex`
- `Fato_Financeiro` -> `vw_fato_financeiro`
- `Fato_DRE_Mensal` -> `vw_dre_mensal`
- `Fato_CMV_Mensal` -> `vw_cmv_mensal`
- `Fato_Margem_Produto` -> `vw_margem_produto`
- `Fato_Resultado_Operacional` -> `vw_resultado_operacional`

Se precisar manter compatibilidade com artefatos antigos:

- `Fato_Vendas` -> `vw_fato_vendas`
- `Fato_CMV` -> `vw_fato_cmv`
- `Dim_Produtos` -> `vw_dim_produtos`

Exemplo de consulta:

```powerquery
= fnLoadView("vw_dim_calendario")
```

## 6. Modelagem recomendada

Siga o relacionamento documentado em `modelo_estrela_powerbi.md`.

Diretrizes principais:

- Relacionamentos `1:*`
- Filtro unidirecional da dimensao para o fato
- Calendario central para todas as tabelas de fato
- Sem relacionamento bidirecional por padrao

## 7. Medidas e layout

Depois de carregar o modelo:

1. Importe as medidas de `medidas_principais.dax`.
2. Importe as medidas de `medidas_executivas_operacionais.dax`.
3. Monte as paginas seguindo:
   - `arquitetura_dashboard_executivo.md`
   - `pagina_inicial_visao_geral_executiva.md`
   - `pagina_dre_cmv_executiva.md`
   - `pagina_margem_produto_executiva.md`
   - `pagina_financeiro_executiva.md`
   - `pagina_estoque_consumo_executiva.md`
   - `pagina_operacao_performance_filial_executiva.md`

## 8. Checklist final

- `npm run bi:check` retorna sucesso.
- Todas as 13 tabelas principais carregam sem erro.
- `Dim_Calendario` esta relacionada a todas as fatos.
- `Dim_Filial`, `Dim_Produto`, `Dim_Cliente` e `Dim_Conta_Financeira` filtram os fatos corretos.
- As medidas DAX compilam sem referencia quebrada.
- O arquivo novo do Power BI foi criado do zero, sem reutilizar o `pbix` legado.
