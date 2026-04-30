# Fluxos criticos do pedido no Pastelzissimo

Base analisada:
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/orders`
- `apps/backend/src/checkout`
- `apps/backend/src/payments`
- `apps/backend/src/modules/kds`
- `apps/backend/src/modules/stock`
- `apps/backend/src/modules/financial`
- `apps/backend/src/modules/tables`
- `apps/backend/src/modules/commands`
- `docs/api/pastelzissimo-api-contract.md`

Decisao central deste desenho:
- O `Order` continua sendo o agregado transacional principal.
- O `OrderStatus` deve continuar usando o enum atual do Prisma.
- `pago` e `enviado a cozinha` nao devem virar novos `OrderStatus` sem necessidade.
- `pago` deve ser tratado como estado financeiro do pedido.
- `enviado a cozinha` deve ser tratado como evento operacional e estado de despacho do item.

## 1. Fluxo de criacao do pedido

Passo a passo recomendado:

1. Receber a requisicao com `requestId`, `idempotencyKey`, `channel`, `orderType` e contexto de autenticacao.
2. Resolver a filial antes de qualquer outra regra. Em producao, a ordem deve ser: JWT administrativo, `X-Branch-Id`, rota contextual, body apenas como fallback controlado. O uso de `DEFAULT_BRANCH_ID` deve ficar restrito a seed, dev local e smoke test.
3. Resolver a empresa a partir da filial. Nenhum produto, mesa, comanda, area de entrega ou caixa pode ser carregado fora do escopo da filial.
4. Resolver o contexto do canal:
   - `DELIVERY`: precisa de cliente e endereco.
   - `PICKUP`: precisa de cliente ou identificador de retirada.
   - `TABLE`: precisa de `tableId` valido.
   - `QR`: precisa de referencia de mesa ou comanda valida.
   - `COMMAND`: precisa de `commandId` aberto.
5. Resolver o cliente:
   - se veio `customerId`, validar se pertence a mesma empresa e nao esta bloqueado;
   - se veio payload de cliente, normalizar telefone e buscar duplicidade por telefone/whatsapp;
   - se nao houver cliente em `TABLE` ou `COMMAND`, permitir cliente anonimo somente quando a politica da filial aceitar.
6. Carregar itens do catalogo no servidor. Nunca confiar em nome, preco, custo, total ou disponibilidade enviados pelo cliente.
7. Validar regras comerciais dos itens, adicionais, variacoes e combos.
8. Montar snapshots do pedido:
   - `productNameSnapshot`
   - `unitPrice`
   - `costSnapshot`
   - `addons.nameSnapshot`
   - `addons.priceSnapshot`
   - observacoes aprovadas
9. Calcular totais integralmente no backend com `Prisma.Decimal`.
10. Persistir tudo em uma transacao unica:
   - `Order`
   - `OrderItem`
   - `OrderItemAddon`
   - estado inicial do pagamento
   - primeiro evento de timeline
   - eventual registro de outbox para KDS, financeiro e realtime
11. Retornar o pedido persistido, com totais calculados pelo servidor e status coerente com o estado do pagamento.

Estado inicial recomendado do pedido:
- `DRAFT` quando existir etapa de montagem/edicao antes da confirmacao.
- `PENDING_CONFIRMATION` quando o pedido ja foi persistido, mas ainda depende de pagamento, validacao humana ou liberacao operacional.
- `CONFIRMED` quando o pedido ja pode seguir para cozinha ou expedicao.

Campos obrigatorios e opcionais:

| Campo | Obrigatorio | Observacao |
| --- | --- | --- |
| `branchId` | sim | obrigatorio por contexto; nao deve depender de default em producao |
| `channel` | sim | usar enum canonico por canal/origem |
| `orderType` | sim | deve mapear para o enum atual do Prisma |
| `items[]` | sim | minimo 1 item |
| `customerId` ou `customer` | depende do canal | obrigatorio para delivery e pickup; opcional em mesa/comanda conforme politica |
| `tableId` | so em `TABLE` | mesa deve existir, pertencer a filial e nao estar bloqueada |
| `commandId` | so em `COMMAND` | comanda deve estar aberta |
| `address` | so em `DELIVERY` | precisa validar area, CEP e filial |
| `payment` | sim | mesmo em post-pago deve existir a politica/metodo esperado |
| `notes` | opcional | apenas se o pedido/canal permitir |
| `internalNotes` | opcional | somente operacao interna |
| `requestId` | obrigatorio para producao | rastreabilidade fim a fim |
| `idempotencyKey` | obrigatorio para canais externos | evita pedido duplicado |

Regras adicionais de abertura:
- `DELIVERY` deve resolver `deliveryAreaId`, taxa, prazo e politica de pagamento antes de confirmar.
- `TABLE` e `QR` devem validar a mesa e manter coerencia com `TableStatus`.
- `COMMAND` deve permitir varios pedidos operacionais associados a uma mesma comanda financeira.
- `PICKUP` nao deve exigir endereco nem aceitar entregador.

## 2. Regras de itens do pedido

Tratamento por tipo:

| Tipo de item | Tratamento recomendado | Validacoes obrigatorias |
| --- | --- | --- |
| item simples | 1 `OrderItem` ligado a um `Product` | produto ativo, canal permitido, quantidade > 0, preco resolvido no servidor |
| item com adicionais | `OrderItem` + `OrderItemAddon[]` com snapshot | grupo permitido para o produto, `minSelect`, `maxSelect`, `allowMultiple`, preco do adicional pelo catalogo |
| item com variacao | usar variante explicita ou produto dedicado | variacao deve alterar SKU/preco/custo de forma auditavel; hoje o schema nao modela isso e precisa evolucao |
| item com combo | registrar item comercial e componentes operacionais | o combo precisa abrir componentes para KDS e estoque; o schema atual tem `Combo`, mas o fluxo de pedido ainda nao consome isso |
| item com observacao especial | salvar em `notes` do item | respeitar `Product.allowNotes`, sanitizar tamanho e bloquear instrucoes proibidas |
| item com restricao de disponibilidade | aplicar restricao antes da persistencia | `isActive`, disponibilidade por canal, horario, filial, estoque e bloqueio comercial |

Validacao de preco:
- O cliente nunca envia preco autoritativo.
- O backend resolve:
  - preco base do produto;
  - delta de variacao;
  - precos de adicionais;
  - preco promocional valido no momento;
  - rateio de desconto de combo, se houver.
- O preco final do item deve ser salvo como snapshot para evitar divergencia futura com o catalogo.

Validacao de custo:
- `costSnapshot` deve ser tirado no momento da abertura do pedido.
- Quando houver ficha tecnica, o custo teorico pode ser calculado e persistido separadamente.
- Em pedido pronto para CMV, o custo realizado deve vir da baixa de estoque, nao apenas do custo de cadastro.

Validacao de quantidade:
- `quantity > 0`.
- Ate 3 casas decimais no banco, como ja existe hoje.
- Para restaurante, a regra pratica recomendada e:
  - quantidade inteira por padrao para itens preparados;
  - quantidade fracionada somente quando o produto permitir explicitamente.

Regras de produto:
- Produto inativo ou removido nao pode ser vendido.
- Produto bloqueado para o canal nao pode entrar no pedido.
- Produto com estoque controlado e politica de bloqueio deve falhar antes da confirmacao.
- Observacao so deve ser aceita quando `allowNotes = true`.
- A estacao de cozinha nao deve depender so de inferencia por palavra-chave em producao; isso deve virar atributo explicito do catalogo.

## 3. Calculo de totais

Ordem correta de calculo:

1. Resolver o preco base de cada item.
2. Somar adicionais e variacoes por unidade.
3. Multiplicar pelo `quantity`.
4. Aplicar descontos de item, se existirem.
5. Somar todos os itens para obter `subtotal`.
6. Aplicar descontos de pedido e cupom.
7. Aplicar acrescimos de servico, embalagem ou taxa operacional.
8. Aplicar frete.
9. Calcular impostos, quando o modelo fiscal exigir valor destacado.
10. Arredondar cada componente monetario com a mesma regra e persistir os componentes.
11. Persistir `totalAmount` como resultado final autoritativo.

Formula recomendada:

```text
unitResolvedPrice = basePrice + variationDelta + addonsPerUnit + comboDelta
lineGross = unitResolvedPrice * quantity
lineNet = lineGross - lineDiscount + lineExtra
subtotal = soma(lineNet)
discountTotal = couponDiscount + orderDiscount + manualDiscount
surchargeTotal = serviceFee + packagingFee + extraFee
taxTotal = impostos exclusivos, se aplicavel
totalAmount = subtotal - discountTotal + surchargeTotal + deliveryFee + taxTotal
```

Regras para evitar divergencia:
- Usar apenas `Prisma.Decimal` do inicio ao fim.
- Nao recalcular com `number` do JavaScript.
- Nao aceitar `subtotal`, `discountAmount` ou `totalAmount` vindos do cliente como fonte de verdade.
- Persistir snapshots dos componentes de linha e do pedido.
- Definir uma unica estrategia de arredondamento e usa-la em todos os modulos.
- Recalcular o pedido inteiro sempre que item, adicional, desconto, taxa ou frete mudar.
- Em cancelamento parcial, recalcular tudo novamente; nao fazer apenas subtracao cega.

Uso do schema atual:
- Ja existem `subtotal`, `discountAmount`, `deliveryFee`, `extraFee` e `totalAmount` em `Order`.
- Para producao completa, falta granularidade para cupom, imposto, desconto manual e desconto por item.

## 4. Fluxo de pagamento

O pagamento precisa ser tratado em duas camadas:
- camada transacional de tentativas e confirmacoes;
- camada agregada do pedido, calculada por `paidAmount`, `refundedAmount` e saldo aberto.

Estados financeiros recomendados:

| Estado do pagamento | Significado | Impacto no pedido |
| --- | --- | --- |
| `PENDING` | pedido aberto sem tentativa concluida | pedido fica em `DRAFT` ou `PENDING_CONFIRMATION` |
| `INITIATED` | tentativa iniciada no gateway | pedido continua aguardando confirmacao |
| `APPROVED` | pagamento aprovado/capturado | soma em `paidAmount`; pode confirmar o pedido |
| `DECLINED` | tentativa recusada | pedido nao avanca para cozinha |
| `PARTIALLY_PAID` | soma aprovada menor que o total | permitido em mesa/comanda/balcao; delivery web deve bloquear por padrao |
| `REFUNDED` | valor aprovado foi estornado | pode levar o pedido a `REFUNDED` quando o estorno for total |
| `CANCELED` | tentativa foi cancelada/void antes da captura | pedido volta a aguardar outra tentativa ou pode ser cancelado |

Regras praticas:
- `OrderPayment` nao deve significar automaticamente "valor pago". Hoje isso acontece em parte do codigo e precisa endurecimento.
- Confirmacao de pagamento precisa ser idempotente por `transactionReference`.
- Em confirmacao, bloquear a linha do pedido com `FOR UPDATE`, como o modulo de pagamentos ja faz hoje.
- O estado agregado do pagamento deve ser calculado por:
  - `approvedAmount = soma de pagamentos aprovados`
  - `refundedAmount = soma de estornos aprovados`
  - `netPaidAmount = approvedAmount - refundedAmount`

Impacto do pagamento no estado do pedido:
- `PENDING` ou `INITIATED`: pedido continua em `DRAFT` ou `PENDING_CONFIRMATION`.
- `APPROVED` total: pedido vai para `CONFIRMED`.
- `PARTIALLY_PAID`: em delivery e pickup publicos deve continuar bloqueado por padrao; em mesa/comanda pode seguir operacionalmente se a politica da filial aceitar.
- `DECLINED`: nao muda o pedido, mas grava evento e permite nova tentativa.
- `REFUNDED` total de pedido cancelado ou devolvido: pedido vai para `REFUNDED`.
- `CANCELED` do pagamento: nao confirma o pedido; nova tentativa ou cancelamento do pedido.

Fluxo fiscal apos confirmacao:

1. o evento de pagamento confirmado e publicado;
2. `FiscalModule` consome o evento de forma assincrona;
3. criar `FiscalDocument` em `READY_TO_ISSUE`;
4. montar e assinar a NFC-e modelo 65;
5. enviar em homologacao para o autorizador suportado;
6. persistir XML, protocolo, chave, status e trilha de auditoria;
7. disponibilizar consulta, retry operacional e cancelamento controlado por endpoint;
8. usar `ProductFiscalProfile` primeiro e fallback fiscal padrao apenas quando necessario;
9. falhas de configuracao, perfil fiscal ou assinatura devem ficar auditadas e previsiveis.

Smoke operacional de homologacao:

1. provisionar certificado A1 e refs de segredo na configuracao fiscal;
2. salvar a configuracao da empresa/filial em homologacao;
3. garantir perfil fiscal por produto nos itens do pedido de teste;
4. emitir um pedido elegivel com pagamento confirmado;
5. acompanhar o documento por `GET /api/v1/fiscal/documents/by-order/:orderId`;
6. se autorizado, testar `POST /api/v1/fiscal/documents/:id/cancel`;
7. em caso de falha transitiva, testar `POST /api/v1/fiscal/documents/:id/retry`;
8. considerar sucesso quando houver chave, protocolo, XML e auditoria persistidos no documento fiscal.

Pagamento parcial:
- deve ser permitido por canal, nao globalmente;
- faz sentido para `TABLE`, `COMMAND`, `COUNTER`;
- nao deve ser o default para `DELIVERY` ou `PICKUP` no Customer App.

Pagamento fora do sistema:
- registrar como liquidacao manual com `source = EXTERNAL`;
- exigir usuario responsavel, referencia externa e motivo;
- manter conciliacao pendente ate conferencia manual ou integracao ERP/PDV.

## 5. Maquina de estados do pedido

Mapeamento recomendado entre a linguagem do negocio e o enum atual:

| Linguagem do negocio | Representacao recomendada |
| --- | --- |
| criado | `DRAFT` ou `PENDING_CONFIRMATION`, conforme o canal |
| aguardando pagamento | `PENDING_CONFIRMATION` + pagamento `PENDING/INITIATED` |
| pago | evento financeiro + `paymentStatus = APPROVED`; o pedido tende a `CONFIRMED` |
| enviado a cozinha | evento de despacho de cozinha, nao um novo `OrderStatus` |
| em preparo | `IN_PREPARATION` |
| pronto | `READY`, `WAITING_PICKUP` ou `WAITING_DISPATCH`, conforme canal |
| entregue | `DELIVERED` |
| cancelado | `CANCELED` |
| estornado | `REFUNDED` |
| concluido | `FINALIZED` |

Transicoes permitidas:
- `DRAFT -> PENDING_CONFIRMATION | CONFIRMED | CANCELED`
- `PENDING_CONFIRMATION -> CONFIRMED | CANCELED`
- `CONFIRMED -> IN_PREPARATION | CANCELED`
- `IN_PREPARATION -> READY | CANCELED`
- `READY -> WAITING_PICKUP | WAITING_DISPATCH | FINALIZED`
- `WAITING_PICKUP -> FINALIZED`
- `WAITING_DISPATCH -> OUT_FOR_DELIVERY`
- `OUT_FOR_DELIVERY -> DELIVERED`
- `DELIVERED -> FINALIZED | REFUNDED`
- `CANCELED -> REFUNDED` quando existir estorno financeiro total concluido
- `FINALIZED -> REFUNDED` apenas com politica de devolucao/estorno total

Transicoes excepcionais e controladas:
- `READY -> IN_PREPARATION` pode existir como reabertura operacional curta do KDS, com janela de tempo e permissao forte.
- `FINALIZED -> READY` so deve existir via reabertura operacional curta, nunca como fluxo normal.

Transicoes que devem ser bloqueadas:
- qualquer avancar direto de `DRAFT` para `READY`, `DELIVERED` ou `FINALIZED`;
- qualquer mudanca a partir de `REFUNDED`, exceto leitura;
- retrocesso manual entre estados sem evento de compensacao;
- cancelamento apos conclusao operacional sem fluxo explicito de devolucao.

Observacao importante:
- `pago` e `enviado a cozinha` devem aparecer na timeline e nas projections, mas nao precisam virar novos `OrderStatus`.

## 6. Envio para cozinha

Momento do disparo:
- O pedido deve ser enviado para cozinha quando estiver operacionalmente liberado.
- Regra base:
  - pagamento total aprovado, ou
  - politica de post-pagamento aceita para o canal, ou
  - liberacao manual da operacao

Gatilho recomendado:
1. pedido entra em `CONFIRMED`;
2. sistema gera eventos de despacho por item elegivel;
3. itens recebem status de envio para KDS;
4. KDS consome os itens por estacao.

Agrupamento por estacao:
- Cada item deve ter uma estacao canonica.
- Em producao, essa estacao deve vir do catalogo do produto.
- O roteamento por palavra-chave hoje existente em `kds-routing.ts` deve ficar apenas como fallback legado.
- O agrupamento deve considerar:
  - estacao
  - filial
  - prioridade do pedido
  - tipo do item
  - tempo estimado

Regras por filial:
- configuracoes por filial devem sair de `CompanySetting` ou configuracao explicita do KDS.
- Cada filial pode definir:
  - quais estacoes estao ativas;
  - se comanda/mesa segue para preparo automatico;
  - se bebida/sobremesa vao para fila separada;
  - se itens sem preparo pulam cozinha e vao direto para expedicao.

Separacao por tipo de item:
- itens preparados vao para estacoes produtivas;
- bebidas e sobremesas vao para estacoes proprias;
- combos precisam ser explodidos em componentes operacionais;
- itens sem preparo podem gerar apenas evento de expedicao, sem ocupar fila de producao.

Tratamento de falhas:
- falha de envio para cozinha nao pode perder o pedido.
- o pedido deve permanecer em `CONFIRMED` com evento `KITCHEN_DISPATCH_FAILED`.
- os itens devem manter `kdsDispatchStatus = PENDING/FAILED` ate reprocessamento.
- o reenvio deve ser idempotente por `orderId + itemId + version`.

Reenvio:
- automatico com retry exponencial;
- manual pelo painel quando o operador solicitar;
- sempre com rastreio de tentativa, erro e usuario que acionou o reenvio.

Gap atual relevante:
- o schema ja possui `sentToKds` em `OrderItem`, mas falta um estado de despacho mais rico e persistente.

## 7. Cancelamento e estorno

Cancelamento total do pedido:

| Situacao | Permitido | Observacao |
| --- | --- | --- |
| antes de `IN_PREPARATION` | sim | motivo obrigatorio; liberar reserva de estoque; cancelar recebivel/pagamento pendente |
| em `IN_PREPARATION` | sim, com override | exige usuario autorizado e politica de perda/desperdicio |
| em `READY` | sim, com restricao | so antes da entrega ao cliente/entregador |
| em `OUT_FOR_DELIVERY` | por excecao | somente com falha operacional controlada e retorno do pedido |
| apos `FINALIZED` | nao | usar devolucao/estorno, nao cancelamento puro |
| apos `REFUNDED` | nao | estado terminal |

Cancelamento parcial de item:
- deve ser suportado por reducao de quantidade ou split da linha.
- permitido enquanto a quantidade cancelada ainda nao foi produzida/entregue.
- exige:
  - motivo obrigatorio;
  - usuario responsavel;
  - recalc total do pedido;
  - ajuste de pagamento/recebivel;
  - evento de KDS para remover ou reduzir o item.

Quando o item ja entrou em preparo:
- a parte nao produzida pode ser cancelada;
- a parte ja produzida deve virar:
  - entrega normal, ou
  - perda/desperdicio (`LOSS`) se inutilizada, ou
  - retorno (`RETURN`) se reaproveitavel pela politica da operacao.

Estorno financeiro:
- sempre exige:
  - motivo;
  - usuario responsavel ou integracao responsavel;
  - referencia do pagamento original;
  - valor do estorno;
  - data/hora;
  - status do estorno.
- tipos:
  - estorno total;
  - estorno parcial;
  - cancelamento de autorizacao antes da captura.

Impacto em estoque:
- se houve apenas reserva, liberar a reserva;
- se houve consumo definitivo, gerar movimento compensatorio ou perda conforme a realidade operacional;
- nunca reverter estoque automaticamente para produto pronto sem politica explicita.

Impacto em financeiro:
- pagamentos aprovados devem gerar evento de refund/void, nao apenas mudanca de status do pedido;
- recebivel deve ser reaberto, baixado parcialmente ou marcado como estornado;
- caixa deve receber movimento negativo se o valor ja entrou no caixa fisico.

## 8. Timeline e rastreabilidade

Padrao recomendado da timeline:

| Campo | Uso |
| --- | --- |
| `occurredAt` | data/hora exata do evento |
| `eventType` | tipo do evento, por exemplo `ORDER_CREATED`, `PAYMENT_APPROVED`, `KITCHEN_DISPATCHED` |
| `previousStatus` | status anterior do pedido, quando houver |
| `newStatus` | novo status do pedido, quando houver |
| `actorType` | `USER`, `SYSTEM`, `INTEGRATION` |
| `actorUserId` | usuario responsavel, quando aplicavel |
| `actorNameSnapshot` | nome do responsavel no momento do evento |
| `sourceModule` | `orders`, `payments`, `kds`, `stock`, `financial`, `delivery`, `erp` |
| `sourceAction` | operacao concreta, por exemplo `confirm_payment`, `assign_driver`, `retry_kds_dispatch` |
| `reasonCode` | codigo padronizado do motivo |
| `reasonText` | motivo textual legivel |
| `channel` | canal de origem do evento |
| `correlationId` | correlacao com request, webhook, job ou integracao externa |
| `payload` | metadados adicionais em JSON |

Eventos minimos da timeline:
- criacao do pedido
- item adicionado/removido/alterado
- totais recalculados
- pagamento iniciado
- pagamento aprovado
- pagamento recusado
- pedido confirmado
- item enviado a cozinha
- item iniciado no KDS
- item pronto
- pedido pronto
- entregador atribuido
- pedido saiu para entrega
- pedido entregue
- pedido cancelado
- estorno solicitado
- estorno concluido
- estoque reservado
- estoque baixado
- financeiro gerado
- retry agendado
- compensacao executada

Uso da timeline:
- auditoria: saber quem fez, quando fez e por que fez;
- operacao: entender gargalos, reaberturas e falhas;
- dashboards: SLA, atraso de cozinha, cancelamento, taxa de conversao de pagamento;
- suporte: responder disputa de cliente e conciliacao de caixa/gateway.

Observacao:
- `OrderStatusLog` atual e uma boa base para status, mas nao cobre pagamento, cozinha, estoque, financeiro e reprocessamento. Para producao, precisa evoluir para timeline generica.

## 9. Integracao com estoque

Fluxo recomendado:

1. Na confirmacao do pedido, validar disponibilidade comercial.
2. Se a operacao exigir bloqueio forte de saldo, criar reserva de estoque por insumo.
3. Na finalizacao operacional:
   - `FINALIZED` para mesa, pickup e balcao;
   - `DELIVERED` ou `FINALIZED` para delivery, conforme politica;
   aplicar a baixa definitiva por ficha tecnica.
4. Registrar `StockMovement` com referencia ao pedido e ao item de estoque.
5. Em cancelamento, liberar reserva ou compensar o consumo ja realizado.

Consumo por ficha tecnica:
- o consumo deve sair de `Recipe` e `RecipeItem`.
- o modulo atual ja faz baixa por receita em `StockMovementService` quando o pedido e finalizado/entregue.
- isso e correto como base, mas ainda falta reserva previa, compensacao estruturada e durabilidade de processamento.

Regras importantes:
- produto sem `controlsStock` pode vender sem baixa;
- produto com `controlsStock` e sem receita nao deve ser finalizado silenciosamente;
- adicionais que consomem insumo precisam ter vinculo de estoque ou receita propria;
- combos devem consumir os componentes, nao um item abstrato sem ficha tecnica.

Reversao em cancelamento:
- antes da baixa definitiva: liberar reserva;
- depois da baixa definitiva:
  - `RETURN` quando o estoque volta fisicamente;
  - `LOSS` quando houve perda;
  - `ADJUSTMENT` somente com justificativa administrativa.

Impacto em perdas e ajustes:
- cancelamento apos preparo nao deve "sumir" com o custo;
- deve gerar evento e movimento coerente com a realidade:
  - consumo realizado;
  - perda reconhecida;
  - retorno, se houver.

Gap atual relevante:
- hoje a baixa e disparada por um event bus em memoria apos `FINALIZED` ou `DELIVERED`.
- para consistencia forte em producao, isso deve virar:
  - transacao sincrona no fechamento, ou
  - outbox duravel com reprocessamento e monitoramento.

## 10. Integracao com financeiro

Fluxo financeiro recomendado:

1. Ao confirmar o pedido, criar ou atualizar o recebivel do pedido.
2. Ao aprovar pagamento, baixar o recebivel parcial ou totalmente.
3. Se o pagamento entrar em caixa fisico, gerar `CashMovement`.
4. Se o pagamento for bancario/gateway, registrar conciliacao pendente ou liquidacao conforme o metodo.
5. Em cancelamento/estorno, gerar reversao financeira correspondente.

Geracao de recebivel:
- `DELIVERY` e `PICKUP` pre-pagos: recebivel nasce em aberto e tende a ser baixado logo na aprovacao.
- `TABLE`, `QR`, `COMMAND`: recebivel pode permanecer em aberto ate o fechamento da conta.
- `COMMAND`: os pagamentos podem ser registrados por comanda e rateados para os pedidos vinculados, mas o vinculo com cada pedido deve permanecer auditavel.

Baixa de caixa:
- `CASH`: gera entrada no caixa aberto da filial.
- `CARD` presencial: pode gerar baixa de caixa ou conta de conciliacao, conforme politica da operacao.
- `PIX`: em geral deve gerar conciliacao bancaria, nao necessariamente caixa fisico.

Conciliacao:
- todo pagamento deve carregar referencia externa quando existir;
- conciliacao deve saber:
  - valor bruto;
  - taxa do meio de pagamento;
  - valor liquido;
  - data prevista de liquidacao;
  - data real de liquidacao;
  - divergencias.

Pedido com pagamento parcial:
- `AccountsReceivable` precisa suportar aberto, parcial, pago, cancelado e estornado;
- o pedido pode estar operacionalmente concluido e financeiramente parcial em `TABLE` e `COMMAND`.

Pedido pago fora do sistema:
- registrar `paymentSource = EXTERNAL`;
- exigir operador responsavel e comprovante;
- manter o pedido rastreavel e conciliavel, sem fingir que o gateway interno aprovou.

Gap atual relevante:
- o modulo financeiro ja possui `AccountsReceivable`, `CashMovement` e `CashRegister`, mas ainda nao esta amarrado automaticamente ao ciclo do pedido.

## 11. Regras por canal

| Canal | Regras principais |
| --- | --- |
| `DELIVERY` | exige cliente, endereco e cobertura geoespacial valida; usa `WAITING_DISPATCH`, `OUT_FOR_DELIVERY`, `DELIVERED` |
| `PICKUP` | nao exige endereco nem entregador; apos `READY`, vai para `WAITING_PICKUP` e depois `FINALIZED` |
| `TABLE` | exige mesa valida; pode operar em post-pagamento; o pedido pode finalizar operacionalmente antes da liquidacao final da mesa |
| `QR` | semelhante a mesa, mas a origem e autoatendimento; exige referencia de mesa/comanda e idempotencia mais forte para evitar duplicidade do cliente |
| `COMMAND` | exige comanda aberta; aceita varios pedidos operacionais; pagamento pode ser parcial e concentrado no fechamento da comanda |

Diferencas praticas de comportamento:
- `DELIVERY` deve bloquear confirmacao se o ponto geocodificado cair fora do poligono de cobertura e nao houver override.
- `PICKUP` pode aceitar pagamento antecipado ou na retirada.
- `TABLE` pode abrir sem cliente identificado, mas a mesa precisa existir e estar em estado compativel.
- `QR` deve priorizar autenticacao do cliente, validacao de mesa e limitacao de repeticao do clique.
- `COMMAND` precisa desacoplar status operacional do pedido do status financeiro da conta.

Observacao importante:
- o enum atual `OrderType` ja cobre `DELIVERY`, `PICKUP`, `TABLE`, `COMMAND` e `QR`.
- o campo `channel` deve ser usado para dizer a origem real do pedido, por exemplo `WEB`, `PDV`, `WHATSAPP`, `KIOSK`, `QR`.

## 12. Falhas e reprocessamento

| Falha | Comportamento recomendado | Retry, fallback e compensacao |
| --- | --- | --- |
| pagamento | nao duplicar confirmacao; manter pedido em espera quando o estado do gateway estiver incerto | idempotencia por `transactionReference`, lock pessimista, job de reconciliacao, nova tentativa controlada |
| envio para cozinha | nao perder pedido nem item | outbox, status de despacho persistido, retry exponencial, reenvio manual, alerta operacional |
| gravacao de estoque | nao deixar baixa silenciosamente falhada | processar em transacao forte ou outbox duravel; se falhar, gerar incidente e impedir encerramento invisivel |
| atualizacao de status | bloquear corrida e transicao invalida | `version` otimista ou lock no pedido, policy central de transicao, reload e retry controlado |
| broadcast em tempo real | nao derrubar a transacao de negocio | tratar como efeito colateral assinado por outbox; websocket e best effort com replay possivel |

Padrao recomendado:
- toda mutacao critica do pedido deve persistir primeiro;
- depois disso, os efeitos colaterais devem sair por outbox;
- cada consumidor deve ser idempotente;
- toda falha reprocessavel deve ter contador de tentativas, ultimo erro e proxima tentativa;
- toda falha nao reprocessavel deve gerar alerta para operacao.

Compensacao:
- pagamento aprovado e pedido cancelado: solicitar refund/void e registrar timeline;
- pedido finalizado e estoque falhou: reprocessar baixa ou abrir incidente operacional;
- item enviado ao KDS duas vezes: consumidor deve ignorar duplicata pela chave idempotente;
- realtime falhou: nao reabrir transacao do pedido; apenas reenfileirar evento.

Gap atual relevante:
- o repositorio ja recomenda Outbox Pattern no contrato da API, mas a implementacao de `OrderFinalizedEventBus` ainda e em memoria e nao sobrevive a restart ou multiplas instancias.

## 13. Ajustes recomendados no schema Prisma

Ajustes realmente necessarios para o pedido virar nucleo transacional de producao:

1. Normalizar enums hoje em `String`:
   - `OrderPayment.paymentMethod`
   - `OrderPayment.status`
   - `OrderItem.status`
   - `Order.channel`
   - `Command.status`
   - `CashRegister.status`
   - `AccountsReceivable.status`
   - `AccountsPayable.status`

2. Evoluir `Order`:
   - adicionar `paymentStatus`
   - adicionar `paidAmount`
   - adicionar `refundedAmount`
   - adicionar `idempotencyKey`
   - adicionar `externalId` e `externalSource`
   - adicionar `version` para controle de concorrencia
   - adicionar campos granulares de total, se houver cupom/imposto/servico

3. Evoluir `OrderPayment`:
   - manter uma linha por transacao/tentativa relevante
   - adicionar `provider`
   - adicionar `providerTransactionId`
   - adicionar `authorizedAt`, `capturedAt`, `canceledAt`, `refundedAt`
   - adicionar `metadata Json`
   - se o dominio exigir estorno detalhado, criar `OrderRefund` ou `PaymentTransaction`

4. Criar tabela de timeline generica:
   - `OrderEvent` ou `OrderTimelineEvent`
   - com `eventType`, `actorType`, `actorUserId`, `sourceModule`, `payload`, `correlationId`
   - `OrderStatusLog` pode continuar existindo como projection de status

5. Evoluir `OrderItem` para composicao e cancelamento parcial:
   - `itemType`
   - `parentItemId`
   - `comboId`
   - `productVariantId`
   - `discountAmount`
   - `extraFeeAmount`
   - `canceledQuantity`
   - `canceledAt`
   - `cancellationReason`
   - `sentToKdsAt`
   - `kdsDispatchStatus`
   - `kdsDispatchError`

6. Tornar a estacao de cozinha explicita no catalogo:
   - adicionar `Product.kitchenStation`
   - manter a inferencia por palavras-chave apenas como fallback legado

7. Suporte a variacao e combo:
   - criar `ProductVariant` se variacao for requisito real;
   - ou materializar variacao como produto proprio enquanto a migracao nao chega;
   - para combo, usar parent/child item ou `bundleKey` persistido.

8. Integracao de estoque mais forte:
   - criar `StockReservation` se a operacao precisar reservar insumo na confirmacao;
   - ligar adicional a estoque/receita quando adicional tambem consumir insumo.

9. Integracao financeira:
   - adicionar relacoes faltantes em `CashMovement` com `CashRegister` e `Order`
   - considerar `conciliationStatus` e referencias externas para pagamentos eletronicos

10. Resiliencia:
   - criar `DomainEvent` ou `IntegrationOutbox`
   - criar persistencia de idempotencia
   - substituir geracao de `orderNumber` por sequencia por filial, nao `count + 1`

Conclusao sobre o schema atual:
- ele ja e uma base boa para pedido, item, pagamento, log de status, estoque por receita e financeiro basico;
- os ajustes acima sao os que realmente faltam para suportar pagamento parcial, estorno, combo, variacao, timeline completa e reprocessamento confiavel.

## 14. Proximos passos de implementacao

Ordem recomendada:

1. Centralizar o dominio do pedido em um unico modulo de aplicacao:
   - `CreateOrder`
   - `RepriceOrder`
   - `ConfirmOrderPayment`
   - `DispatchOrderToKitchen`
   - `StartOrderPreparation`
   - `MarkOrderReady`
   - `FinalizeOrder`
   - `CancelOrder`
   - `CancelOrderItem`
   - `RefundOrder`

2. Tirar defaults de filial/empresa dos fluxos criticos e exigir escopo real por request.

3. Criar migrations para:
   - enums faltantes;
   - timeline generica;
   - estado financeiro agregado;
   - idempotencia e outbox;
   - evolucao de `OrderItem`.

4. Endurecer a politica de pagamento:
   - nada de `OrderPayment` com status `paid` por presenca de linha apenas;
   - nada de pagamento zero como substituto de post-pagamento;
   - confirmacao sempre idempotente e auditavel.

5. Implementar despacho de cozinha persistente:
   - servico proprio;
   - marca de despacho por item;
   - retry e reenvio manual.

6. Integrar estoque de forma confiavel:
   - reserva opcional na confirmacao;
   - consumo definitivo na conclusao;
   - compensacao em cancelamento/estorno.

7. Integrar financeiro automaticamente:
   - recebivel por pedido ou por comanda com rateio claro;
   - baixa parcial/total;
   - caixa e conciliacao.

8. Padronizar canais:
   - `OrderType` para forma operacional;
   - `OrderChannel` para origem;
   - politicas de pagamento e despacho por canal/filial.

9. Implementar testes de dominio e integracao:
   - criacao com adicionais
   - pagamento aprovado/recusado
   - cancelamento total e parcial
   - estorno total e parcial
   - despacho KDS com retry
   - baixa de estoque
   - fechamento de mesa/comanda
   - concorrencia em pagamento e status

10. So depois disso conectar integracoes externas:
   - WebSocket robusto
   - ERP
   - PDV
   - marketplaces
   - webhooks de gateway

Resultado esperado apos essa sequencia:
- pedido como agregado central do sistema;
- pagamento, cozinha, estoque e financeiro coerentes entre si;
- multi-filial real;
- trilha completa de auditoria;
- base segura para Customer App, KDS, PDV e integracoes futuras.
