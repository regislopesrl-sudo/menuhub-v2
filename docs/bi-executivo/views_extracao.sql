-- BI extraction layer for Power BI (star schema focused).
-- Source of truth: PostgreSQL transactional schema (orders, order_items, stock_movements, finance tables).
-- Scope: DRE, CMV, margem e resultado operacional em ambiente multi-filial.
--
-- Key conventions:
-- - Unknown branch:  00000000-0000-0000-0000-000000000000
-- - Unknown product: 00000000-0000-0000-0000-000000000001
-- - Unknown customer:00000000-0000-0000-0000-000000000002

-- =========================================================
-- DIMENSIONS
-- =========================================================

-- Central time dimension generated from transaction ranges.
CREATE OR REPLACE VIEW public.vw_dim_calendario AS
WITH bounds AS (
  SELECT
    LEAST(
      COALESCE(
        (
          SELECT MIN(COALESCE(o.finalized_at, o.delivered_at, o.confirmed_at, o.created_at)::date)
          FROM orders o
          WHERE o.deleted_at IS NULL
        ),
        CURRENT_DATE - INTERVAL '365 day'
      ),
      COALESCE(
        (SELECT MIN(sm.created_at::date) FROM stock_movements sm),
        CURRENT_DATE - INTERVAL '365 day'
      ),
      COALESCE(
        (SELECT MIN(COALESCE(ar.due_date, ar.created_at)::date) FROM accounts_receivable ar),
        CURRENT_DATE - INTERVAL '365 day'
      ),
      COALESCE(
        (SELECT MIN(COALESCE(ap.due_date, ap.created_at)::date) FROM accounts_payable ap),
        CURRENT_DATE - INTERVAL '365 day'
      )
    )::date AS start_date,
    GREATEST(
      COALESCE(
        (
          SELECT MAX(COALESCE(o.finalized_at, o.delivered_at, o.confirmed_at, o.created_at)::date)
          FROM orders o
          WHERE o.deleted_at IS NULL
        ),
        CURRENT_DATE + INTERVAL '365 day'
      ),
      COALESCE(
        (SELECT MAX(sm.created_at::date) FROM stock_movements sm),
        CURRENT_DATE + INTERVAL '365 day'
      ),
      COALESCE(
        (SELECT MAX(COALESCE(ar.due_date, ar.created_at)::date) FROM accounts_receivable ar),
        CURRENT_DATE + INTERVAL '365 day'
      ),
      COALESCE(
        (SELECT MAX(COALESCE(ap.due_date, ap.created_at)::date) FROM accounts_payable ap),
        CURRENT_DATE + INTERVAL '365 day'
      )
    )::date AS end_date
),
calendar AS (
  SELECT generate_series(bounds.start_date, bounds.end_date, INTERVAL '1 day')::date AS date_day
  FROM bounds
)
SELECT
  (EXTRACT(YEAR FROM c.date_day)::int * 10000 + EXTRACT(MONTH FROM c.date_day)::int * 100 + EXTRACT(DAY FROM c.date_day)::int) AS date_key,
  c.date_day,
  EXTRACT(YEAR FROM c.date_day)::int AS year_num,
  EXTRACT(MONTH FROM c.date_day)::int AS month_num,
  CASE EXTRACT(MONTH FROM c.date_day)::int
    WHEN 1 THEN 'Jan'
    WHEN 2 THEN 'Fev'
    WHEN 3 THEN 'Mar'
    WHEN 4 THEN 'Abr'
    WHEN 5 THEN 'Mai'
    WHEN 6 THEN 'Jun'
    WHEN 7 THEN 'Jul'
    WHEN 8 THEN 'Ago'
    WHEN 9 THEN 'Set'
    WHEN 10 THEN 'Out'
    WHEN 11 THEN 'Nov'
    WHEN 12 THEN 'Dez'
  END AS month_name_short,
  to_char(c.date_day, 'YYYY-MM') AS year_month,
  (EXTRACT(YEAR FROM c.date_day)::int * 100 + EXTRACT(MONTH FROM c.date_day)::int) AS year_month_key,
  EXTRACT(QUARTER FROM c.date_day)::int AS quarter_num,
  'T' || EXTRACT(QUARTER FROM c.date_day)::int AS quarter_name,
  EXTRACT(DAY FROM c.date_day)::int AS day_num,
  EXTRACT(WEEK FROM c.date_day)::int AS week_num,
  EXTRACT(ISODOW FROM c.date_day)::int AS weekday_num,
  CASE EXTRACT(ISODOW FROM c.date_day)::int
    WHEN 1 THEN 'Seg'
    WHEN 2 THEN 'Ter'
    WHEN 3 THEN 'Qua'
    WHEN 4 THEN 'Qui'
    WHEN 5 THEN 'Sex'
    WHEN 6 THEN 'Sab'
    WHEN 7 THEN 'Dom'
  END AS weekday_name_short,
  (EXTRACT(ISODOW FROM c.date_day)::int IN (6, 7)) AS is_weekend,
  date_trunc('month', c.date_day)::date AS month_start_date,
  (date_trunc('month', c.date_day) + INTERVAL '1 month - 1 day')::date AS month_end_date
FROM calendar c;


-- Branch dimension with synthetic unknown member.
CREATE OR REPLACE VIEW public.vw_dim_filial AS
SELECT
  b.id AS branch_id,
  b.company_id,
  c.trade_name AS company_trade_name,
  c.legal_name AS company_legal_name,
  b.code AS branch_code,
  b.name AS branch_name,
  CASE
    WHEN c.trade_name IS NOT NULL THEN c.trade_name || ' - ' || b.name
    ELSE b.name
  END AS branch_display_name,
  b.city,
  b.state,
  b.is_active,
  b.created_at,
  b.updated_at
FROM branches b
LEFT JOIN companies c
  ON c.id = b.company_id

UNION ALL

SELECT
  '00000000-0000-0000-0000-000000000000'::text AS branch_id,
  NULL::text AS company_id,
  'Nao informado'::text AS company_trade_name,
  'Nao informado'::text AS company_legal_name,
  NULL::text AS branch_code,
  'Sem filial'::text AS branch_name,
  'Sem filial'::text AS branch_display_name,
  NULL::text AS city,
  NULL::text AS state,
  TRUE AS is_active,
  NULL::timestamp AS created_at,
  NULL::timestamp AS updated_at;


-- Product dimension with theoretical cost and synthetic unknown member.
CREATE OR REPLACE VIEW public.vw_dim_produto AS
WITH recipe_costs AS (
  SELECT
    r.id AS recipe_id,
    COALESCE(
      SUM(
        CASE
          WHEN ri.affects_cost IS FALSE THEN 0
          ELSE COALESCE(ri.quantity, 0) * COALESCE(si.average_cost, 0)
        END
      ),
      0
    ) AS base_cost,
    COALESCE(r.yield_quantity, 1) AS yield_quantity,
    COALESCE(r.loss_percent, 0) AS loss_percent
  FROM recipes r
  LEFT JOIN recipe_items ri
    ON ri.recipe_id = r.id
  LEFT JOIN stock_items si
    ON si.id = ri.stock_item_id
  GROUP BY r.id, r.yield_quantity, r.loss_percent
),
product_base AS (
  SELECT
    p.id AS product_id,
    p.company_id,
    p.category_id,
    COALESCE(pc.name, 'Sem categoria') AS category_name,
    p.name AS product_name,
    p.description,
    p.sku,
    p.pdv_code,
    p.sale_price,
    p.promotional_price,
    p.cost_price,
    p.local_price,
    p.delivery_pickup_price,
    p.prep_time_minutes,
    p.image_url,
    p.recipe_id,
    r.name AS recipe_name,
    r.type::text AS recipe_type,
    r.yield_quantity AS recipe_yield_quantity,
    r.yield_unit AS recipe_yield_unit,
    r.loss_percent AS recipe_loss_percent,
    p.is_active,
    p.is_featured,
    p.controls_stock,
    p.allow_notes,
    p.available_delivery,
    p.available_counter,
    p.available_table,
    p.sort_order,
    p.created_at,
    p.updated_at,
    p.deleted_at,
    CASE
      WHEN p.recipe_id IS NULL
        OR r.active IS FALSE
        OR COALESCE(rc.base_cost, 0) <= 0
      THEN COALESCE(p.cost_price, 0)
      ELSE ROUND(
        (COALESCE(rc.base_cost, 0) / NULLIF(COALESCE(rc.yield_quantity, 1), 0))
        * (1 + COALESCE(rc.loss_percent, 0) / 100.0),
        4
      )
    END AS theoretical_unit_cost
  FROM products p
  LEFT JOIN product_categories pc
    ON pc.id = p.category_id
  LEFT JOIN recipes r
    ON r.id = p.recipe_id
  LEFT JOIN recipe_costs rc
    ON rc.recipe_id = p.recipe_id
)
SELECT
  pb.product_id,
  pb.company_id,
  pb.category_id,
  pb.category_name,
  pb.product_name,
  pb.description,
  pb.sku,
  pb.pdv_code,
  pb.sale_price,
  pb.promotional_price,
  pb.cost_price,
  pb.local_price,
  pb.delivery_pickup_price,
  pb.prep_time_minutes,
  pb.image_url,
  pb.recipe_id,
  pb.recipe_name,
  pb.recipe_type,
  pb.recipe_yield_quantity,
  pb.recipe_yield_unit,
  pb.recipe_loss_percent,
  pb.is_active,
  pb.is_featured,
  pb.controls_stock,
  pb.allow_notes,
  pb.available_delivery,
  pb.available_counter,
  pb.available_table,
  pb.sort_order,
  pb.created_at,
  pb.updated_at,
  pb.deleted_at,
  pb.theoretical_unit_cost,
  ROUND(COALESCE(pb.sale_price, 0) - COALESCE(pb.theoretical_unit_cost, 0), 4) AS gross_margin_unit,
  CASE
    WHEN COALESCE(pb.sale_price, 0) > 0
    THEN ROUND(
      (COALESCE(pb.sale_price, 0) - COALESCE(pb.theoretical_unit_cost, 0))
      / NULLIF(pb.sale_price, 0) * 100,
      2
    )
    ELSE 0
  END AS gross_margin_pct
FROM product_base pb

UNION ALL

SELECT
  '00000000-0000-0000-0000-000000000001'::text AS product_id,
  NULL::text AS company_id,
  NULL::text AS category_id,
  'Nao informado'::text AS category_name,
  'Produto nao informado'::text AS product_name,
  NULL::text AS description,
  NULL::text AS sku,
  NULL::text AS pdv_code,
  0::numeric(12,2) AS sale_price,
  NULL::numeric(12,2) AS promotional_price,
  0::numeric(12,2) AS cost_price,
  0::numeric(12,2) AS local_price,
  0::numeric(12,2) AS delivery_pickup_price,
  0::integer AS prep_time_minutes,
  NULL::text AS image_url,
  NULL::text AS recipe_id,
  NULL::text AS recipe_name,
  NULL::text AS recipe_type,
  NULL::numeric(12,3) AS recipe_yield_quantity,
  NULL::text AS recipe_yield_unit,
  NULL::numeric(5,2) AS recipe_loss_percent,
  FALSE AS is_active,
  FALSE AS is_featured,
  FALSE AS controls_stock,
  TRUE AS allow_notes,
  TRUE AS available_delivery,
  TRUE AS available_counter,
  TRUE AS available_table,
  0::integer AS sort_order,
  NULL::timestamp AS created_at,
  NULL::timestamp AS updated_at,
  NULL::timestamp AS deleted_at,
  0::numeric(12,4) AS theoretical_unit_cost,
  0::numeric(12,4) AS gross_margin_unit,
  0::numeric(12,2) AS gross_margin_pct;


-- Compatibility alias for existing artifacts that still use plural naming.
CREATE OR REPLACE VIEW public.vw_dim_produtos AS
SELECT * FROM public.vw_dim_produto;


-- Customer dimension with synthetic unknown member.
CREATE OR REPLACE VIEW public.vw_dim_cliente AS
SELECT
  c.id AS customer_id,
  c.company_id,
  c.name AS customer_name,
  c.phone,
  c.whatsapp,
  c.email,
  c.cpf_cnpj,
  c.birth_date,
  c.is_vip,
  c.is_blocked,
  (c.deleted_at IS NULL) AS is_active,
  c.created_at,
  c.updated_at,
  c.deleted_at
FROM customers c

UNION ALL

SELECT
  '00000000-0000-0000-0000-000000000002'::text AS customer_id,
  NULL::text AS company_id,
  'Consumidor nao identificado'::text AS customer_name,
  NULL::text AS phone,
  NULL::text AS whatsapp,
  NULL::text AS email,
  NULL::text AS cpf_cnpj,
  NULL::timestamp AS birth_date,
  FALSE AS is_vip,
  FALSE AS is_blocked,
  TRUE AS is_active,
  NULL::timestamp AS created_at,
  NULL::timestamp AS updated_at,
  NULL::timestamp AS deleted_at;


-- Financial account dimension (minimal, stable and conformed with financial fact).
CREATE OR REPLACE VIEW public.vw_dim_conta_financeira AS
SELECT *
FROM (
  VALUES
    ('RECEITA_OPERACIONAL'::text, 'Receita Operacional'::text, 'RECEITA'::text, 'ACCOUNTS_RECEIVABLE'::text, 1::integer),
    ('DESPESA_OPERACIONAL'::text, 'Despesa Operacional'::text, 'DESPESA'::text, 'ACCOUNTS_PAYABLE'::text, 2::integer),
    ('NAO_CLASSIFICADO'::text, 'Nao classificado'::text, 'NEUTRO'::text, 'UNKNOWN'::text, 999::integer)
) AS t(conta_financeira_id, conta_financeira_nome, natureza, origem, sort_order);


-- =========================================================
-- FACTS (TRANSACTION GRAIN)
-- =========================================================

-- Grain: one row per order.
CREATE OR REPLACE VIEW public.vw_fato_pedidos AS
WITH item_totals AS (
  SELECT
    oi.order_id,
    COUNT(*)::integer AS item_line_count,
    COALESCE(SUM(oi.quantity), 0)::numeric(14,3) AS item_quantity,
    COALESCE(SUM(oi.total_price), 0)::numeric(14,2) AS items_amount
  FROM order_items oi
  GROUP BY oi.order_id
),
addon_totals AS (
  SELECT
    oi.order_id,
    COALESCE(SUM(COALESCE(oia.price_snapshot, 0) * COALESCE(oia.quantity, 1)), 0)::numeric(14,2) AS addons_amount
  FROM order_items oi
  LEFT JOIN order_item_addons oia
    ON oia.order_item_id = oi.id
  GROUP BY oi.order_id
)
SELECT
  o.id AS order_id,
  o.order_number,
  COALESCE(o.finalized_at, o.delivered_at, o.confirmed_at, o.created_at)::date AS order_date,
  COALESCE(o.finalized_at, o.delivered_at, o.confirmed_at, o.created_at) AS order_datetime_ref,
  o.created_at,
  o.updated_at,
  o.company_id,
  COALESCE(o.branch_id, '00000000-0000-0000-0000-000000000000'::text) AS branch_id,
  COALESCE(o.customer_id, '00000000-0000-0000-0000-000000000002'::text) AS customer_id,
  o.order_type::text AS order_type,
  o.channel,
  o.status::text AS order_status,
  o.priority,
  COALESCE(it.item_line_count, 0) AS item_line_count,
  COALESCE(it.item_quantity, 0) AS item_quantity,
  COALESCE(it.items_amount, 0) AS items_amount,
  COALESCE(at.addons_amount, 0) AS addons_amount,
  COALESCE(o.subtotal, 0) AS subtotal,
  COALESCE(o.discount_amount, 0) AS discount_amount,
  COALESCE(o.delivery_fee, 0) AS delivery_fee,
  COALESCE(o.extra_fee, 0) AS extra_fee,
  COALESCE(o.total_amount, 0) AS total_amount,
  (o.status IN ('DELIVERED', 'FINALIZED', 'REFUNDED')) AS order_finalized,
  o.cancellation_reason,
  o.canceled_at,
  o.confirmed_at,
  o.preparation_started_at,
  o.ready_at,
  o.dispatched_at,
  o.delivered_at,
  o.finalized_at
FROM orders o
LEFT JOIN item_totals it
  ON it.order_id = o.id
LEFT JOIN addon_totals at
  ON at.order_id = o.id
WHERE o.deleted_at IS NULL;


-- Grain: one row per order item (finalized orders only).
CREATE OR REPLACE VIEW public.vw_fato_itens_pedido AS
WITH addon_totals AS (
  SELECT
    oia.order_item_id,
    COALESCE(SUM(COALESCE(oia.price_snapshot, 0) * COALESCE(oia.quantity, 1)), 0)::numeric(14,4) AS addon_revenue
  FROM order_item_addons oia
  GROUP BY oia.order_item_id
),
item_base AS (
  SELECT
    oi.id AS order_item_id,
    o.id AS order_id,
    o.order_number,
    COALESCE(o.finalized_at, o.delivered_at, o.confirmed_at, o.created_at)::date AS order_date,
    COALESCE(o.finalized_at, o.delivered_at, o.confirmed_at, o.created_at) AS order_datetime_ref,
    o.created_at AS order_created_at,
    o.updated_at AS order_updated_at,
    o.company_id,
    COALESCE(o.branch_id, '00000000-0000-0000-0000-000000000000'::text) AS branch_id,
    COALESCE(o.customer_id, '00000000-0000-0000-0000-000000000002'::text) AS customer_id,
    COALESCE(oi.product_id, '00000000-0000-0000-0000-000000000001'::text) AS product_id,
    COALESCE(oi.product_name_snapshot, p.name, 'Produto nao informado') AS product_name,
    p.category_id,
    COALESCE(pc.name, 'Sem categoria') AS category_name,
    oi.station::text AS station,
    o.order_type::text AS order_type,
    o.channel,
    o.status::text AS order_status,
    COALESCE(oi.quantity, 0) AS quantity,
    COALESCE(oi.unit_price, 0) AS unit_price,
    COALESCE(oi.total_price, 0) AS base_item_revenue,
    COALESCE(at.addon_revenue, 0) AS addon_revenue,
    COALESCE(o.subtotal, 0) AS order_subtotal,
    COALESCE(o.discount_amount, 0) AS order_discount_amount,
    COALESCE(o.delivery_fee, 0) AS order_delivery_fee,
    COALESCE(o.extra_fee, 0) AS order_extra_fee,
    COALESCE(o.total_amount, 0) AS order_total_amount,
    COALESCE(oi.cost_snapshot, 0) AS unit_cost_snapshot,
    COALESCE(oi.theoretical_cost_snapshot, 0) AS theoretical_unit_cost_snapshot,
    oi.notes AS item_notes
  FROM orders o
  INNER JOIN order_items oi
    ON oi.order_id = o.id
  LEFT JOIN addon_totals at
    ON at.order_item_id = oi.id
  LEFT JOIN products p
    ON p.id = oi.product_id
  LEFT JOIN product_categories pc
    ON pc.id = p.category_id
  WHERE o.deleted_at IS NULL
    AND o.status IN ('DELIVERED', 'FINALIZED', 'REFUNDED')
),
calculated AS (
  SELECT
    ib.*,
    CASE
      WHEN ib.order_subtotal > 0
      THEN ROUND(ib.base_item_revenue * ib.order_discount_amount / NULLIF(ib.order_subtotal, 0), 4)
      ELSE 0
    END AS discount_allocated
  FROM item_base ib
)
SELECT
  c.order_item_id,
  c.order_id,
  c.order_number,
  c.order_date,
  c.order_datetime_ref,
  c.order_created_at,
  c.order_updated_at,
  c.company_id,
  c.branch_id,
  c.customer_id,
  c.product_id,
  c.product_name,
  c.category_id,
  c.category_name,
  c.station,
  c.order_type,
  c.channel,
  c.order_status,
  c.quantity,
  c.unit_price,
  c.base_item_revenue,
  c.addon_revenue,
  c.order_subtotal,
  c.order_discount_amount,
  c.order_delivery_fee,
  c.order_extra_fee,
  c.order_total_amount,
  c.unit_cost_snapshot,
  c.theoretical_unit_cost_snapshot,
  c.item_notes,
  c.discount_allocated,
  0::numeric(14,4) AS refund_amount,
  ROUND(c.base_item_revenue + c.addon_revenue, 4) AS gross_revenue,
  ROUND((c.base_item_revenue + c.addon_revenue) - c.discount_allocated, 4) AS net_revenue,
  ROUND(c.quantity * c.unit_cost_snapshot, 4) AS actual_cost_total,
  ROUND(c.quantity * c.theoretical_unit_cost_snapshot, 4) AS theoretical_cost_total,
  ROUND(((c.base_item_revenue + c.addon_revenue) - c.discount_allocated) - (c.quantity * c.unit_cost_snapshot), 4) AS gross_profit,
  ROUND(((c.base_item_revenue + c.addon_revenue) - c.discount_allocated) - (c.quantity * c.theoretical_unit_cost_snapshot), 4) AS theoretical_gross_profit
FROM calculated c;


-- Grain: one row per stock movement.
CREATE OR REPLACE VIEW public.vw_fato_kardex AS
SELECT
  sm.id AS movement_id,
  sm.created_at AS movement_datetime,
  sm.created_at::date AS movement_date,
  COALESCE(o.company_id, si.company_id) AS company_id,
  COALESCE(o.branch_id, '00000000-0000-0000-0000-000000000000'::text) AS branch_id,
  CASE
    WHEN sm.source_module = 'orders' THEN sm.source_id
    ELSE NULL
  END AS order_id,
  o.order_number,
  sm.stock_item_id,
  si.name AS stock_item_name,
  si.category_id AS stock_category_id,
  COALESCE(sc.name, 'Sem categoria') AS stock_category_name,
  sm.batch_id,
  sm.movement_type::text AS movement_type,
  sm.movement_type_detailed,
  sm.source_module,
  sm.source_id,
  sm.reference_type,
  sm.reference_id,
  COALESCE(sm.previous_stock, 0) AS previous_stock,
  COALESCE(sm.new_stock, 0) AS new_stock,
  COALESCE(sm.quantity, 0) AS quantity,
  COALESCE(sm.unit_cost, 0) AS unit_cost,
  COALESCE(sm.total_cost, 0) AS total_cost,
  ABS(COALESCE(sm.total_cost, 0)) AS total_cost_abs,
  sm.reason_code,
  sm.notes,
  (sm.movement_type IN ('SALE_CONSUMPTION', 'LOSS')) AS considera_cmv,
  CASE
    WHEN sm.movement_type = 'SALE_CONSUMPTION' THEN 'CONSUMO_VENDA'
    WHEN sm.movement_type = 'LOSS' THEN 'PERDA'
    ELSE 'OUTROS'
  END AS cmv_bucket
FROM stock_movements sm
INNER JOIN stock_items si
  ON si.id = sm.stock_item_id
LEFT JOIN stock_categories sc
  ON sc.id = si.category_id
LEFT JOIN orders o
  ON sm.source_module = 'orders'
 AND o.id = sm.source_id;


-- Grain: one row per financial title (accounts receivable/payable).
CREATE OR REPLACE VIEW public.vw_fato_financeiro AS
SELECT
  ar.id AS financial_id,
  'RECEIVABLE:' || ar.id::text AS financial_key,
  'RECEIVABLE'::text AS source_type,
  b.company_id,
  COALESCE(ar.branch_id, '00000000-0000-0000-0000-000000000000'::text) AS branch_id,
  'RECEITA_OPERACIONAL'::text AS conta_financeira_id,
  COALESCE(ar.customer_id, '00000000-0000-0000-0000-000000000002'::text) AS customer_id,
  ar.order_id,
  NULL::text AS supplier_id,
  ar.status::text AS financial_status,
  ar.description,
  COALESCE(ar.due_date, ar.created_at::date) AS due_date,
  ar.created_at::date AS issue_date,
  COALESCE(ar.due_date, ar.created_at::date) AS reference_date,
  COALESCE(ar.amount, 0) AS amount,
  COALESCE(ar.amount, 0) AS amount_signed,
  'RECEITA'::text AS natureza
FROM accounts_receivable ar
LEFT JOIN branches b
  ON b.id = ar.branch_id

UNION ALL

SELECT
  ap.id AS financial_id,
  'PAYABLE:' || ap.id::text AS financial_key,
  'PAYABLE'::text AS source_type,
  b.company_id,
  COALESCE(ap.branch_id, '00000000-0000-0000-0000-000000000000'::text) AS branch_id,
  'DESPESA_OPERACIONAL'::text AS conta_financeira_id,
  NULL::text AS customer_id,
  NULL::text AS order_id,
  ap.supplier_id,
  ap.status::text AS financial_status,
  ap.description,
  COALESCE(ap.due_date, ap.created_at::date) AS due_date,
  ap.created_at::date AS issue_date,
  COALESCE(ap.due_date, ap.created_at::date) AS reference_date,
  COALESCE(ap.amount, 0) AS amount,
  COALESCE(ap.amount, 0) * -1 AS amount_signed,
  'DESPESA'::text AS natureza
FROM accounts_payable ap
LEFT JOIN branches b
  ON b.id = ap.branch_id;


-- =========================================================
-- FACTS (MONTHLY GRAIN / EXECUTIVE LAYER)
-- =========================================================

-- Grain: month + branch for CMV.
CREATE OR REPLACE VIEW public.vw_cmv_mensal AS
WITH base AS (
  SELECT
    date_trunc('month', k.movement_date)::date AS month_date,
    k.company_id,
    k.branch_id,
    k.movement_type,
    k.total_cost_abs
  FROM vw_fato_kardex k
  WHERE k.considera_cmv
)
SELECT
  b.month_date,
  (EXTRACT(YEAR FROM b.month_date)::int * 100 + EXTRACT(MONTH FROM b.month_date)::int) AS year_month_key,
  EXTRACT(YEAR FROM b.month_date)::int AS year_num,
  EXTRACT(MONTH FROM b.month_date)::int AS month_num,
  b.company_id,
  b.branch_id,
  ROUND(SUM(CASE WHEN b.movement_type = 'SALE_CONSUMPTION' THEN b.total_cost_abs ELSE 0 END), 2) AS cmv_consumo_venda,
  ROUND(SUM(CASE WHEN b.movement_type = 'LOSS' THEN b.total_cost_abs ELSE 0 END), 2) AS cmv_perda,
  ROUND(SUM(b.total_cost_abs), 2) AS cmv_total
FROM base b
GROUP BY
  b.month_date,
  b.company_id,
  b.branch_id;


-- Grain: month + branch for DRE.
CREATE OR REPLACE VIEW public.vw_dre_mensal AS
WITH receitas AS (
  SELECT
    date_trunc('month', i.order_date)::date AS month_date,
    i.company_id,
    i.branch_id,
    SUM(i.gross_revenue) AS receita_bruta,
    SUM(i.discount_allocated) AS desconto_total,
    SUM(i.net_revenue) AS receita_liquida
  FROM vw_fato_itens_pedido i
  GROUP BY
    date_trunc('month', i.order_date)::date,
    i.company_id,
    i.branch_id
),
pedidos AS (
  SELECT
    date_trunc('month', p.order_date)::date AS month_date,
    p.company_id,
    p.branch_id,
    COUNT(DISTINCT p.order_id) AS pedidos_finalizados
  FROM vw_fato_pedidos p
  WHERE p.order_finalized
  GROUP BY
    date_trunc('month', p.order_date)::date,
    p.company_id,
    p.branch_id
),
cmv AS (
  SELECT
    c.month_date,
    c.company_id,
    c.branch_id,
    SUM(c.cmv_total) AS cmv_total
  FROM vw_cmv_mensal c
  GROUP BY
    c.month_date,
    c.company_id,
    c.branch_id
),
despesas AS (
  SELECT
    date_trunc('month', f.reference_date)::date AS month_date,
    f.company_id,
    f.branch_id,
    SUM(
      CASE
        WHEN f.natureza = 'DESPESA'
          AND lower(COALESCE(f.financial_status, '')) NOT IN ('canceled', 'cancelado')
        THEN ABS(f.amount_signed)
        ELSE 0
      END
    ) AS despesas_operacionais
  FROM vw_fato_financeiro f
  GROUP BY
    date_trunc('month', f.reference_date)::date,
    f.company_id,
    f.branch_id
),
chaves AS (
  SELECT month_date, company_id, branch_id FROM receitas
  UNION
  SELECT month_date, company_id, branch_id FROM pedidos
  UNION
  SELECT month_date, company_id, branch_id FROM cmv
  UNION
  SELECT month_date, company_id, branch_id FROM despesas
)
SELECT
  c.month_date,
  (EXTRACT(YEAR FROM c.month_date)::int * 100 + EXTRACT(MONTH FROM c.month_date)::int) AS year_month_key,
  EXTRACT(YEAR FROM c.month_date)::int AS year_num,
  EXTRACT(MONTH FROM c.month_date)::int AS month_num,
  c.company_id,
  c.branch_id,
  ROUND(COALESCE(r.receita_bruta, 0), 2) AS receita_bruta,
  ROUND(COALESCE(r.desconto_total, 0), 2) AS desconto_total,
  ROUND(COALESCE(r.receita_liquida, 0), 2) AS receita_liquida,
  ROUND(COALESCE(cmv.cmv_total, 0), 2) AS cmv_total,
  ROUND(COALESCE(r.receita_liquida, 0) - COALESCE(cmv.cmv_total, 0), 2) AS lucro_bruto,
  ROUND(COALESCE(d.despesas_operacionais, 0), 2) AS despesas_operacionais,
  ROUND((COALESCE(r.receita_liquida, 0) - COALESCE(cmv.cmv_total, 0)) - COALESCE(d.despesas_operacionais, 0), 2) AS resultado_operacional,
  COALESCE(p.pedidos_finalizados, 0) AS pedidos_finalizados,
  CASE
    WHEN COALESCE(p.pedidos_finalizados, 0) > 0
    THEN ROUND(COALESCE(r.receita_liquida, 0) / NULLIF(p.pedidos_finalizados, 0), 2)
    ELSE 0
  END AS ticket_medio
FROM chaves c
LEFT JOIN receitas r
  ON r.month_date = c.month_date
 AND r.company_id = c.company_id
 AND r.branch_id = c.branch_id
LEFT JOIN pedidos p
  ON p.month_date = c.month_date
 AND p.company_id = c.company_id
 AND p.branch_id = c.branch_id
LEFT JOIN cmv
  ON cmv.month_date = c.month_date
 AND cmv.company_id = c.company_id
 AND cmv.branch_id = c.branch_id
LEFT JOIN despesas d
  ON d.month_date = c.month_date
 AND d.company_id = c.company_id
 AND d.branch_id = c.branch_id;


-- Grain: month + branch + product for margin analytics.
CREATE OR REPLACE VIEW public.vw_margem_produto AS
WITH base AS (
  SELECT
    date_trunc('month', i.order_date)::date AS month_date,
    i.company_id,
    i.branch_id,
    i.product_id,
    i.quantity,
    i.gross_revenue,
    i.discount_allocated,
    i.net_revenue,
    i.actual_cost_total,
    i.theoretical_cost_total
  FROM vw_fato_itens_pedido i
)
SELECT
  b.month_date,
  (EXTRACT(YEAR FROM b.month_date)::int * 100 + EXTRACT(MONTH FROM b.month_date)::int) AS year_month_key,
  EXTRACT(YEAR FROM b.month_date)::int AS year_num,
  EXTRACT(MONTH FROM b.month_date)::int AS month_num,
  b.company_id,
  b.branch_id,
  b.product_id,
  SUM(b.quantity) AS quantity_sold,
  ROUND(SUM(b.gross_revenue), 2) AS receita_bruta,
  ROUND(SUM(b.discount_allocated), 2) AS desconto_total,
  ROUND(SUM(b.net_revenue), 2) AS receita_liquida,
  ROUND(SUM(b.actual_cost_total), 2) AS custo_real,
  ROUND(SUM(b.theoretical_cost_total), 2) AS custo_teorico,
  ROUND(SUM(b.net_revenue) - SUM(b.actual_cost_total), 2) AS lucro_bruto_real,
  ROUND(SUM(b.net_revenue) - SUM(b.theoretical_cost_total), 2) AS lucro_bruto_teorico,
  CASE
    WHEN SUM(b.net_revenue) > 0
    THEN ROUND((SUM(b.net_revenue) - SUM(b.actual_cost_total)) / NULLIF(SUM(b.net_revenue), 0) * 100, 2)
    ELSE 0
  END AS margem_bruta_real_pct,
  CASE
    WHEN SUM(b.net_revenue) > 0
    THEN ROUND((SUM(b.net_revenue) - SUM(b.theoretical_cost_total)) / NULLIF(SUM(b.net_revenue), 0) * 100, 2)
    ELSE 0
  END AS margem_bruta_teorica_pct
FROM base b
GROUP BY
  b.month_date,
  b.company_id,
  b.branch_id,
  b.product_id;


-- Grain: month + branch with final executive indicators.
CREATE OR REPLACE VIEW public.vw_resultado_operacional AS
SELECT
  d.month_date,
  d.year_month_key,
  d.year_num,
  d.month_num,
  d.company_id,
  d.branch_id,
  d.receita_bruta,
  d.desconto_total,
  d.receita_liquida,
  d.cmv_total,
  d.lucro_bruto,
  d.despesas_operacionais,
  d.resultado_operacional,
  d.pedidos_finalizados,
  d.ticket_medio,
  CASE
    WHEN d.receita_liquida > 0
    THEN ROUND(d.lucro_bruto / NULLIF(d.receita_liquida, 0) * 100, 2)
    ELSE 0
  END AS margem_bruta_pct,
  CASE
    WHEN d.receita_liquida > 0
    THEN ROUND(d.resultado_operacional / NULLIF(d.receita_liquida, 0) * 100, 2)
    ELSE 0
  END AS margem_operacional_pct
FROM vw_dre_mensal d;


-- =========================================================
-- LEGACY COMPATIBILITY VIEWS (existing dashboard assets)
-- =========================================================

CREATE OR REPLACE VIEW public.vw_fato_vendas AS
SELECT
  i.order_item_id AS sales_line_id,
  ROW_NUMBER() OVER (PARTITION BY i.order_id ORDER BY i.order_item_id) AS line_number,
  i.order_id,
  i.order_number,
  i.order_datetime_ref AS order_referenced_at,
  i.order_date,
  i.order_created_at,
  i.company_id,
  i.branch_id,
  i.customer_id,
  NULL::text AS customer_address_id,
  NULL::text AS delivery_area_id,
  NULL::text AS table_id,
  NULL::text AS command_id,
  NULL::text AS driver_id,
  NULL::text AS created_by_id,
  i.product_id,
  i.product_name,
  i.category_id AS product_category_id,
  i.category_name AS product_category_name,
  i.station,
  i.order_type,
  i.channel,
  i.order_status,
  0::integer AS priority,
  i.quantity,
  i.unit_price,
  i.base_item_revenue,
  i.addon_revenue,
  i.order_subtotal,
  i.order_discount_amount,
  i.order_delivery_fee,
  i.order_extra_fee,
  i.order_total_amount,
  i.unit_cost_snapshot,
  i.theoretical_unit_cost_snapshot,
  NULL::text AS cancellation_reason,
  NULL::timestamp AS confirmed_at,
  NULL::timestamp AS preparation_started_at,
  NULL::timestamp AS ready_at,
  NULL::timestamp AS dispatched_at,
  NULL::timestamp AS delivered_at,
  NULL::timestamp AS finalized_at,
  NULL::timestamp AS canceled_at,
  i.discount_allocated,
  i.refund_amount,
  i.gross_revenue,
  i.net_revenue,
  i.actual_cost_total,
  i.theoretical_cost_total,
  i.gross_profit,
  i.theoretical_gross_profit
FROM vw_fato_itens_pedido i;


CREATE OR REPLACE VIEW public.vw_fato_cmv AS
SELECT
  k.movement_id,
  k.movement_datetime,
  k.movement_date,
  k.company_id,
  k.branch_id,
  k.order_id AS source_order_id,
  k.order_number AS source_order_number,
  k.stock_item_id,
  k.stock_item_name,
  k.stock_category_id,
  k.stock_category_name,
  k.movement_type,
  k.movement_type_detailed,
  k.source_module,
  k.source_id,
  k.reference_type,
  k.reference_id,
  k.previous_stock,
  k.new_stock,
  k.quantity,
  k.unit_cost,
  k.total_cost,
  k.reason_code,
  k.notes,
  CASE
    WHEN k.movement_type = 'SALE_CONSUMPTION' THEN 'sale_consumption'
    WHEN k.movement_type = 'LOSS' THEN 'loss'
    ELSE 'other'
  END AS cmv_bucket
FROM vw_fato_kardex k
WHERE k.considera_cmv;


-- =========================================================
-- DIRECTQUERY / PERFORMANCE NOTES
-- =========================================================
-- Keep period filters in Power BI to reduce scanned volume.
-- Recommended composite indexes:
--   CREATE INDEX IF NOT EXISTS idx_orders_created_at_status_branch_id
--     ON orders (created_at, status, branch_id);
--   CREATE INDEX IF NOT EXISTS idx_order_items_order_id_product_id
--     ON order_items (order_id, product_id);
--   CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at_movement_type_source_id
--     ON stock_movements (created_at, movement_type, source_id);
--   CREATE INDEX IF NOT EXISTS idx_accounts_receivable_created_at_branch_id
--     ON accounts_receivable (created_at, branch_id);
--   CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at_branch_id
--     ON accounts_payable (created_at, branch_id);

-- =========================================================
-- VERIFICATION PLACEHOLDERS
-- =========================================================
-- [REQUIRES VERIFICATION] payment_date in vw_fato_financeiro:
--   schema does not expose settlement date consistently for all sources.
-- [REQUIRES VERIFICATION] is_operational in vw_dim_conta_financeira:
--   depends on accounting chart classification not explicit in schema.
-- [TO BE COMPLETED] is_fixed / is_variable in vw_dim_conta_financeira:
--   requires accounting/business rule for fixed-vs-variable split.
