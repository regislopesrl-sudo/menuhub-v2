-- Compatibility layer between the current Prisma physical schema
-- (PascalCase tables / camelCase columns) and the BI extraction layer
-- documented in views_extracao.sql (snake_case identifiers).

CREATE OR REPLACE VIEW public.companies AS
SELECT
  c.id,
  c."legalName" AS legal_name,
  c."tradeName" AS trade_name,
  c.cnpj,
  c.phone,
  c.whatsapp,
  c.email,
  c."logoUrl" AS logo_url,
  c."createdAt" AS created_at,
  c."updatedAt" AS updated_at
FROM public."Company" c;


CREATE OR REPLACE VIEW public.branches AS
SELECT
  b.id,
  b."companyId" AS company_id,
  b.name,
  b.code,
  b.phone,
  b.whatsapp,
  b.email,
  b.city,
  b.state,
  b."isActive" AS is_active,
  b."createdAt" AS created_at,
  b."updatedAt" AS updated_at
FROM public."Branch" b;


CREATE OR REPLACE VIEW public.customers AS
SELECT
  c.id,
  c."companyId" AS company_id,
  c.name,
  c.phone,
  c.whatsapp,
  c.email,
  c."cpfCnpj" AS cpf_cnpj,
  c."birthDate" AS birth_date,
  c.notes,
  c."isVip" AS is_vip,
  c."isBlocked" AS is_blocked,
  c."createdAt" AS created_at,
  c."updatedAt" AS updated_at,
  c."deletedAt" AS deleted_at
FROM public."Customer" c;


CREATE OR REPLACE VIEW public.product_categories AS
SELECT
  pc.id,
  pc."companyId" AS company_id,
  pc.name,
  pc."sortOrder" AS sort_order,
  pc."isActive" AS is_active
FROM public."ProductCategory" pc;


CREATE OR REPLACE VIEW public.products AS
SELECT
  p.id,
  p."companyId" AS company_id,
  p."categoryId" AS category_id,
  p.name,
  p.description,
  p.sku,
  p."salePrice" AS sale_price,
  p."promotionalPrice" AS promotional_price,
  p."costPrice" AS cost_price,
  p."localPrice" AS local_price,
  p."deliveryPickupPrice" AS delivery_pickup_price,
  p."pdvCode" AS pdv_code,
  p."prepTimeMinutes" AS prep_time_minutes,
  p."imageUrl" AS image_url,
  p."recipeId" AS recipe_id,
  p."isActive" AS is_active,
  p."isFeatured" AS is_featured,
  p."controlsStock" AS controls_stock,
  p."allowNotes" AS allow_notes,
  p."availableDelivery" AS available_delivery,
  p."availableCounter" AS available_counter,
  p."availableTable" AS available_table,
  p."sortOrder" AS sort_order,
  p."createdAt" AS created_at,
  p."updatedAt" AS updated_at,
  p."deletedAt" AS deleted_at,
  p."kitchenStation" AS kitchen_station
FROM public."Product" p;


CREATE OR REPLACE VIEW public.recipes AS
SELECT
  r.id,
  r."companyId" AS company_id,
  r.name,
  r.type,
  r."yieldQuantity" AS yield_quantity,
  r."yieldUnit" AS yield_unit,
  r."lossPercent" AS loss_percent,
  r.active,
  r."createdAt" AS created_at,
  r."updatedAt" AS updated_at
FROM public."Recipe" r;


CREATE OR REPLACE VIEW public.recipe_items AS
SELECT
  ri.id,
  ri."recipeId" AS recipe_id,
  ri."stockItemId" AS stock_item_id,
  ri.quantity,
  ri.unit,
  ri.optional,
  ri."affectsCost" AS affects_cost,
  ri."affectsStock" AS affects_stock,
  ri."createdAt" AS created_at
FROM public."RecipeItem" ri;


CREATE OR REPLACE VIEW public.stock_categories AS
SELECT
  sc.id,
  sc."companyId" AS company_id,
  sc.name,
  sc."sortOrder" AS sort_order,
  sc."isActive" AS is_active
FROM public."StockCategory" sc;


CREATE OR REPLACE VIEW public.stock_items AS
SELECT
  si.id,
  si."companyId" AS company_id,
  si."categoryId" AS category_id,
  si."supplierId" AS supplier_id,
  si.name,
  si.code,
  si."purchaseUnit" AS purchase_unit,
  si."stockUnit" AS stock_unit,
  si."productionUnit" AS production_unit,
  si."conversionFactor" AS conversion_factor,
  si."currentQuantity" AS current_quantity,
  si."minimumQuantity" AS minimum_quantity,
  si."reorderPoint" AS reorder_point,
  si."averageCost" AS average_cost,
  si."lastCost" AS last_cost,
  si."standardCost" AS standard_cost,
  si."leadTimeDays" AS lead_time_days,
  si."controlsBatch" AS controls_batch,
  si."controlsExpiry" AS controls_expiry,
  si."requiresFefo" AS requires_fefo,
  si."isPerishable" AS is_perishable,
  si."isFractionable" AS is_fractionable,
  si."isCritical" AS is_critical,
  si."isHighTurnover" AS is_high_turnover,
  si."isActive" AS is_active,
  si."stockType" AS stock_type,
  si."allowNegativeStock" AS allow_negative_stock,
  si."controlsStock" AS controls_stock,
  si."createdAt" AS created_at,
  si."updatedAt" AS updated_at
FROM public."StockItem" si;


CREATE OR REPLACE VIEW public.orders AS
SELECT
  o.id,
  o."companyId" AS company_id,
  o."branchId" AS branch_id,
  o."customerId" AS customer_id,
  o."tableId" AS table_id,
  o."commandId" AS command_id,
  o."deliveryAreaId" AS delivery_area_id,
  o."driverId" AS driver_id,
  o."deliveryLatitude" AS delivery_latitude,
  o."deliveryLongitude" AS delivery_longitude,
  o."outsideDeliveryZone" AS outside_delivery_zone,
  o."deliveryDistanceMeters" AS delivery_distance_meters,
  o."deliveryDurationSec" AS delivery_duration_sec,
  o."customerAddressId" AS customer_address_id,
  o."orderNumber" AS order_number,
  o."orderType" AS order_type,
  o.channel,
  o.status,
  o.subtotal,
  o."discountAmount" AS discount_amount,
  o."deliveryFee" AS delivery_fee,
  o."extraFee" AS extra_fee,
  o."totalAmount" AS total_amount,
  o.notes,
  o."internalNotes" AS internal_notes,
  o."cancellationReason" AS cancellation_reason,
  o."createdById" AS created_by_id,
  o."confirmedAt" AS confirmed_at,
  o."preparationStartedAt" AS preparation_started_at,
  o."readyAt" AS ready_at,
  o."dispatchedAt" AS dispatched_at,
  o."deliveredAt" AS delivered_at,
  o."finalizedAt" AS finalized_at,
  o."canceledAt" AS canceled_at,
  o."createdAt" AS created_at,
  o."updatedAt" AS updated_at,
  o."deletedAt" AS deleted_at,
  o.priority,
  o."idempotencyKey" AS idempotency_key,
  o."paymentStatus" AS payment_status,
  o."paidAmount" AS paid_amount,
  o."refundedAmount" AS refunded_amount
FROM public."Order" o;


CREATE OR REPLACE VIEW public.order_items AS
SELECT
  oi.id,
  oi."orderId" AS order_id,
  oi."productId" AS product_id,
  oi."productNameSnapshot" AS product_name_snapshot,
  oi.quantity,
  oi."unitPrice" AS unit_price,
  oi."costSnapshot" AS cost_snapshot,
  oi."theoreticalCostSnapshot" AS theoretical_cost_snapshot,
  oi."totalPrice" AS total_price,
  oi.notes,
  oi."sentToKds" AS sent_to_kds,
  oi.status,
  oi."createdAt" AS created_at,
  oi."finishedAt" AS finished_at,
  oi."startedAt" AS started_at,
  oi.station,
  oi."sentToKdsAt" AS sent_to_kds_at,
  oi."kdsDispatchError" AS kds_dispatch_error
FROM public."OrderItem" oi;


CREATE OR REPLACE VIEW public.order_item_addons AS
SELECT
  oia.id,
  oia."orderItemId" AS order_item_id,
  oia."addonItemId" AS addon_item_id,
  oia."nameSnapshot" AS name_snapshot,
  oia."priceSnapshot" AS price_snapshot,
  oia.quantity
FROM public."OrderItemAddon" oia;


CREATE OR REPLACE VIEW public.order_payments AS
SELECT
  op.id,
  op."orderId" AS order_id,
  op."paymentMethod" AS payment_method,
  op.amount,
  op."refundedAmount" AS refunded_amount,
  op.status,
  op."transactionReference" AS transaction_reference,
  op.provider,
  op."providerTransactionId" AS provider_transaction_id,
  op."authorizedAt" AS authorized_at,
  op."capturedAt" AS captured_at,
  op."canceledAt" AS canceled_at,
  op."refundedAt" AS refunded_at,
  op.metadata,
  op."paidAt" AS paid_at
FROM public."OrderPayment" op;


CREATE OR REPLACE VIEW public.order_status_logs AS
SELECT
  osl.id,
  osl."orderId" AS order_id,
  osl."userId" AS user_id,
  osl."previousStatus" AS previous_status,
  osl."newStatus" AS new_status,
  osl.notes,
  osl."createdAt" AS created_at
FROM public."OrderStatusLog" osl;


CREATE OR REPLACE VIEW public.order_timeline_events AS
SELECT
  ote.id,
  ote."orderId" AS order_id,
  ote."actorType" AS actor_type,
  ote."actorUserId" AS actor_user_id,
  ote."eventType" AS event_type,
  ote."previousStatus" AS previous_status,
  ote."newStatus" AS new_status,
  ote."sourceModule" AS source_module,
  ote."sourceAction" AS source_action,
  ote."reasonCode" AS reason_code,
  ote."reasonText" AS reason_text,
  ote.channel,
  ote."correlationId" AS correlation_id,
  ote.payload,
  ote."createdAt" AS created_at
FROM public."OrderTimelineEvent" ote;


CREATE OR REPLACE VIEW public.stock_movements AS
SELECT
  sm.id,
  sm."stockItemId" AS stock_item_id,
  sm."batchId" AS batch_id,
  sm."movementType" AS movement_type,
  sm."movementTypeDetailed" AS movement_type_detailed,
  sm."sourceModule" AS source_module,
  sm."sourceId" AS source_id,
  sm."referenceType" AS reference_type,
  sm."referenceId" AS reference_id,
  sm.quantity,
  sm."unitCost" AS unit_cost,
  sm."totalCost" AS total_cost,
  sm."reasonCode" AS reason_code,
  sm.notes,
  sm."createdAt" AS created_at,
  sm."newStock" AS new_stock,
  sm."previousStock" AS previous_stock
FROM public."StockMovement" sm;


CREATE OR REPLACE VIEW public.accounts_receivable AS
SELECT
  ar.id,
  ar."branchId" AS branch_id,
  ar."customerId" AS customer_id,
  ar."orderId" AS order_id,
  ar.description,
  ar.amount,
  ar."dueDate" AS due_date,
  ar.status,
  ar."createdAt" AS created_at
FROM public."AccountsReceivable" ar;


CREATE OR REPLACE VIEW public.accounts_payable AS
SELECT
  ap.id,
  ap."branchId" AS branch_id,
  ap."supplierId" AS supplier_id,
  ap.description,
  ap.amount,
  ap."dueDate" AS due_date,
  ap.status,
  ap."purchaseOrderId" AS purchase_order_id,
  ap."createdAt" AS created_at
FROM public."AccountsPayable" ap;
