DO $$ BEGIN
  CREATE TYPE "PurchaseFiscalDocumentStatus" AS ENUM ('PENDING_REVIEW', 'PARTIALLY_MAPPED', 'READY_TO_CONFIRM', 'CONFIRMED', 'CANCELED', 'LOOKUP_FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PurchaseFiscalDocumentItemStatus" AS ENUM ('UNMAPPED', 'MAPPED', 'IGNORED', 'CONFIRMED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PurchaseFiscalDocumentSource" AS ENUM ('MANUAL_KEY', 'MOCK_PROVIDER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PurchaseFiscalDocumentType" AS ENUM ('NFE', 'NFCE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "purchase_documents" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "supplier_id" TEXT,
  "document_type" "PurchaseFiscalDocumentType" NOT NULL DEFAULT 'NFCE',
  "access_key" TEXT NOT NULL,
  "issuer_cnpj" TEXT,
  "issuer_name" TEXT,
  "emitted_at" TIMESTAMP(3),
  "total_amount" DECIMAL(12,2),
  "status" "PurchaseFiscalDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "source" "PurchaseFiscalDocumentSource" NOT NULL DEFAULT 'MANUAL_KEY',
  "provider_name" TEXT,
  "raw_provider" JSONB,
  "created_by_user_id" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_documents_company_id_access_key_key" ON "purchase_documents"("company_id", "access_key");
CREATE INDEX IF NOT EXISTS "purchase_documents_company_id_branch_id_status_created_at_idx" ON "purchase_documents"("company_id", "branch_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "purchase_documents_supplier_id_idx" ON "purchase_documents"("supplier_id");

CREATE TABLE IF NOT EXISTS "purchase_document_items" (
  "id" TEXT PRIMARY KEY,
  "purchase_document_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "line_number" INTEGER,
  "fiscal_code" TEXT,
  "ean" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unit" TEXT,
  "unit_price" DECIMAL(12,4),
  "total_amount" DECIMAL(12,2),
  "mapped_stock_item_id" TEXT,
  "conversion_factor" DECIMAL(14,6) NOT NULL DEFAULT 1,
  "batch_number" TEXT,
  "expiration_date" TIMESTAMP(3),
  "status" "PurchaseFiscalDocumentItemStatus" NOT NULL DEFAULT 'UNMAPPED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_document_items_purchase_document_id_fkey" FOREIGN KEY ("purchase_document_id") REFERENCES "purchase_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "purchase_document_items_company_id_branch_id_idx" ON "purchase_document_items"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "purchase_document_items_purchase_document_id_idx" ON "purchase_document_items"("purchase_document_id");
CREATE INDEX IF NOT EXISTS "purchase_document_items_mapped_stock_item_id_idx" ON "purchase_document_items"("mapped_stock_item_id");

CREATE TABLE IF NOT EXISTS "supplier_item_mappings" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "supplier_id" TEXT,
  "issuer_cnpj" TEXT,
  "fiscal_code" TEXT,
  "ean" TEXT,
  "fiscal_name" TEXT NOT NULL,
  "stock_item_id" TEXT NOT NULL,
  "input_unit" TEXT,
  "conversion_factor" DECIMAL(14,6) NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "supplier_item_mappings_company_id_idx" ON "supplier_item_mappings"("company_id");
CREATE INDEX IF NOT EXISTS "supplier_item_mappings_supplier_id_idx" ON "supplier_item_mappings"("supplier_id");
CREATE INDEX IF NOT EXISTS "supplier_item_mappings_issuer_cnpj_idx" ON "supplier_item_mappings"("issuer_cnpj");
CREATE INDEX IF NOT EXISTS "supplier_item_mappings_stock_item_id_idx" ON "supplier_item_mappings"("stock_item_id");
