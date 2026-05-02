# Importacao de Cardapio

## Escopo da primeira versao

- formato suportado: `CSV`
- formato explicitamente bloqueado nesta v1: `XLSX`
- modo de persistencia: `UPSERT`
- surface admin: `Catalogo > Importacao`

## Fluxo

1. subir um arquivo CSV no admin
2. gerar preview
3. revisar colunas detectadas, linhas invalidas, deduplicacao e entidades previstas
4. confirmar importacao
5. consultar o historico da importacao e os erros por linha

## Colunas suportadas

O importador aceita sinonimos no cabecalho. Os grupos principais suportados hoje sao:

- categoria: `categoria`, `category`
- produto: `nome do produto`, `nomeproduto`, `produto`, `product`
- descricao: `descricao`, `description`
- sku: `sku`
- codigo externo: `codigo externo`, `externalId`, `pdvCode`
- preco: `preco`, `salePrice`, `valor`
- preco promocional: `preco promocional`, `promotionalPrice`
- status: `ativo`, `status`
- visibilidade: `visivel no cardapio`, `visible`
- imagem: `url da imagem`, `imageUrl`
- destaque: `destaque`, `featured`
- grupo de adicional: `grupo de adicionais`, `nome do grupo adicional`
- adicional: `adicional`, `nome do adicional`
- preco do adicional: `preco adicional`
- obrigatorio/minimo/maximo: `obrigatorio`, `minimo`, `maximo`
- combo: `combo`, `nome do combo`
- itens do combo: `itens combo`, `combo items`

## Regra de deduplicacao

- categoria: nome normalizado
- produto: `codigo externo -> pdvCode`, senao `sku`, senao `categoria + nome`
- grupo de adicional: `nome do grupo + contexto do produto`
- item adicional: `nome + grupo`
- combo: nome normalizado

## Regra create/update/skip

- modo fixo: `UPSERT`
- cria categoria quando ela nao existe e o nome e seguro
- cria produto novo quando a chave nao existe
- atualiza produto existente quando a chave e resolvida
- ignora ou marca erro quando a linha nao pode ser resolvida com seguranca

## Adicionais vinculados ao produto

- adicional so entra quando existe produto resolvido
- o importador cria ou atualiza o grupo
- depois vincula o grupo ao produto via `product_addon_groups`
- adicional sem produto ou sem grupo vira erro explicito no preview

## Combos

- combos sao suportados somente quando os itens do combo podem ser resolvidos contra produtos existentes ou importados no mesmo arquivo
- quando o vinculo dos itens nao pode ser resolvido, a linha fica com erro e o combo nao e persistido

## Auditoria

Cada importacao persiste:

- quem importou
- quando importou
- nome do arquivo
- status
- totais de linhas
- total criado, atualizado, ignorado e com erro
- detalhes e mensagens por linha

## Limitacoes conhecidas

- `XLSX` ainda nao suportado nesta primeira versao
- `externalId` do sistema de origem e persistido em `pdvCode` porque o contrato atual de produto nao possui campo dedicado
- deduplicacao de combo usa nome porque o dominio atual de combos nao possui `sku` ou `externalId`
