DO $$ BEGIN
  CREATE TYPE "FinancialCategoryType" AS ENUM ('REVENUE', 'EXPENSE', 'BOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'BANK', 'PIX', 'CARD', 'MARKETPLACE', 'TRANSITORY', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinancialDataStatus" AS ENUM ('COMPLETE', 'PARTIAL_DATA', 'NO_DATA');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "FinancialReconciliationStatus" ADD VALUE 'RECONCILED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "FinancialReconciliationStatus" ADD VALUE 'IGNORED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "financial_categories" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "parent_id" TEXT,
  "type" "FinancialCategoryType" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "financial_categories_company_id_idx" ON "financial_categories"("company_id");
CREATE INDEX IF NOT EXISTS "financial_categories_company_id_type_idx" ON "financial_categories"("company_id", "type");
CREATE INDEX IF NOT EXISTS "financial_categories_company_id_status_idx" ON "financial_categories"("company_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_categories_company_id_type_name_key" ON "financial_categories"("company_id", "type", "name");

CREATE TABLE IF NOT EXISTS "cost_centers" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cost_centers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cost_centers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cost_centers_company_id_idx" ON "cost_centers"("company_id");
CREATE INDEX IF NOT EXISTS "cost_centers_company_id_branch_id_idx" ON "cost_centers"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "cost_centers_company_id_status_idx" ON "cost_centers"("company_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "cost_centers_company_id_branch_id_name_key" ON "cost_centers"("company_id", "branch_id", "name");

CREATE TABLE IF NOT EXISTS "financial_accounts" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "type" "FinancialAccountType" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_accounts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "financial_accounts_company_id_idx" ON "financial_accounts"("company_id");
CREATE INDEX IF NOT EXISTS "financial_accounts_company_id_branch_id_idx" ON "financial_accounts"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "financial_accounts_company_id_type_idx" ON "financial_accounts"("company_id", "type");
CREATE INDEX IF NOT EXISTS "financial_accounts_company_id_status_idx" ON "financial_accounts"("company_id", "status");

ALTER TABLE "accounts_payable" ADD COLUMN IF NOT EXISTS "financial_account_id" TEXT;
ALTER TABLE "accounts_payable" ADD COLUMN IF NOT EXISTS "category_id" TEXT;
ALTER TABLE "accounts_payable" ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;

ALTER TABLE "accounts_receivable" ADD COLUMN IF NOT EXISTS "financial_account_id" TEXT;
ALTER TABLE "accounts_receivable" ADD COLUMN IF NOT EXISTS "category_id" TEXT;
ALTER TABLE "accounts_receivable" ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;

ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "financial_account_id" TEXT;
ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "category_id" TEXT;
ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "cost_center_id" TEXT;
ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'POSTED';
ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "canceled_by_id" TEXT;
ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "canceled_at" TIMESTAMP(3);
ALTER TABLE "financial_ledger_entries" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_financial_account_id_fkey" FOREIGN KEY ("financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "financial_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
DO $$ BEGIN
  ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_cost_center_id_fkey" FOREIGN KEY ("cost_center_id") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "accounts_payable_financial_account_id_idx" ON "accounts_payable"("financial_account_id");
CREATE INDEX IF NOT EXISTS "accounts_payable_category_id_idx" ON "accounts_payable"("category_id");
CREATE INDEX IF NOT EXISTS "accounts_payable_cost_center_id_idx" ON "accounts_payable"("cost_center_id");
CREATE INDEX IF NOT EXISTS "accounts_receivable_financial_account_id_idx" ON "accounts_receivable"("financial_account_id");
CREATE INDEX IF NOT EXISTS "accounts_receivable_category_id_idx" ON "accounts_receivable"("category_id");
CREATE INDEX IF NOT EXISTS "accounts_receivable_cost_center_id_idx" ON "accounts_receivable"("cost_center_id");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_branch_id_status_created_at_idx" ON "financial_ledger_entries"("branch_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_financial_account_id_idx" ON "financial_ledger_entries"("financial_account_id");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_category_id_idx" ON "financial_ledger_entries"("category_id");
CREATE INDEX IF NOT EXISTS "financial_ledger_entries_cost_center_id_idx" ON "financial_ledger_entries"("cost_center_id");

CREATE TABLE IF NOT EXISTS "cash_flow_snapshots" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_expense" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_cash_flow" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "projected_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "projected_expense" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "projected_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "data_status" "FinancialDataStatus" NOT NULL DEFAULT 'COMPLETE',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_flow_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cash_flow_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cash_flow_snapshots_company_id_idx" ON "cash_flow_snapshots"("company_id");
CREATE INDEX IF NOT EXISTS "cash_flow_snapshots_company_id_branch_id_idx" ON "cash_flow_snapshots"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "cash_flow_snapshots_company_id_period_start_period_end_idx" ON "cash_flow_snapshots"("company_id", "period_start", "period_end");

CREATE TABLE IF NOT EXISTS "dre_snapshots" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "gross_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discounts" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cancellations_refunds" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cmv" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gross_margin" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "operational_expenses" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "payment_fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "delivery_fees" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "operational_profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "data_status" "FinancialDataStatus" NOT NULL DEFAULT 'PARTIAL_DATA',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dre_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "dre_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "dre_snapshots_company_id_idx" ON "dre_snapshots"("company_id");
CREATE INDEX IF NOT EXISTS "dre_snapshots_company_id_branch_id_idx" ON "dre_snapshots"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "dre_snapshots_company_id_period_start_period_end_idx" ON "dre_snapshots"("company_id", "period_start", "period_end");

CREATE TABLE IF NOT EXISTS "cmv_snapshots" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "product_id" TEXT,
  "category_id" TEXT,
  "stock_item_id" TEXT,
  "quantity_sold" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "average_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "revenue" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gross_margin" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "gross_margin_pct" DECIMAL(8,4) NOT NULL DEFAULT 0,
  "data_status" "FinancialDataStatus" NOT NULL DEFAULT 'PARTIAL_DATA',
  "source_type" "FinancialOriginType",
  "source_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cmv_snapshots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cmv_snapshots_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cmv_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cmv_snapshots_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "cmv_snapshots_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cmv_snapshots_company_id_idx" ON "cmv_snapshots"("company_id");
CREATE INDEX IF NOT EXISTS "cmv_snapshots_company_id_branch_id_idx" ON "cmv_snapshots"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "cmv_snapshots_company_id_period_start_period_end_idx" ON "cmv_snapshots"("company_id", "period_start", "period_end");
CREATE INDEX IF NOT EXISTS "cmv_snapshots_product_id_idx" ON "cmv_snapshots"("product_id");
CREATE INDEX IF NOT EXISTS "cmv_snapshots_category_id_idx" ON "cmv_snapshots"("category_id");
CREATE INDEX IF NOT EXISTS "cmv_snapshots_stock_item_id_idx" ON "cmv_snapshots"("stock_item_id");

CREATE TABLE IF NOT EXISTS "payment_fees" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "payment_id" TEXT,
  "order_id" TEXT,
  "provider" TEXT,
  "method" TEXT,
  "gross_amount" DECIMAL(14,2) NOT NULL,
  "fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(14,2) NOT NULL,
  "fee_pct" DECIMAL(8,4),
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_fees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_fees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_fees_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_fees_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "payment_fees_company_id_idx" ON "payment_fees"("company_id");
CREATE INDEX IF NOT EXISTS "payment_fees_company_id_branch_id_idx" ON "payment_fees"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "payment_fees_payment_id_idx" ON "payment_fees"("payment_id");
CREATE INDEX IF NOT EXISTS "payment_fees_order_id_idx" ON "payment_fees"("order_id");
CREATE INDEX IF NOT EXISTS "payment_fees_occurred_at_idx" ON "payment_fees"("occurred_at");

CREATE TABLE IF NOT EXISTS "receivable_schedules" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "account_receivable_id" TEXT,
  "payment_id" TEXT,
  "provider" TEXT,
  "method" TEXT,
  "gross_amount" DECIMAL(14,2) NOT NULL,
  "fee_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(14,2) NOT NULL,
  "expected_date" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "receivable_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "receivable_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivable_schedules_account_receivable_id_fkey" FOREIGN KEY ("account_receivable_id") REFERENCES "accounts_receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "receivable_schedules_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "order_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "receivable_schedules_company_id_idx" ON "receivable_schedules"("company_id");
CREATE INDEX IF NOT EXISTS "receivable_schedules_company_id_branch_id_idx" ON "receivable_schedules"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "receivable_schedules_expected_date_idx" ON "receivable_schedules"("expected_date");
CREATE INDEX IF NOT EXISTS "receivable_schedules_status_idx" ON "receivable_schedules"("status");
CREATE INDEX IF NOT EXISTS "receivable_schedules_payment_id_idx" ON "receivable_schedules"("payment_id");
