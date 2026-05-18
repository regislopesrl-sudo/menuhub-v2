-- CreateTable
CREATE TABLE "purchase_receipts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "purchase_order_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "received_by_user_id" TEXT,
    "received_at" TIMESTAMP(3),
    "document_number" TEXT,
    "fiscal_key" TEXT,
    "total_received_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "purchase_order_item_id" TEXT,
    "stock_item_id" TEXT,
    "description" TEXT,
    "quantity_received" DECIMAL(14,4) NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "total_cost" DECIMAL(14,2),
    "divergence_type" TEXT,
    "mapping_status" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_quotes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "stock_item_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "quoted_unit_cost" DECIMAL(14,4),
    "unit_of_measure" TEXT,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_conferences" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "purchase_order_id" TEXT,
    "receipt_id" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fiscal_key" TEXT,
    "document_number" TEXT,
    "total_amount" DECIMAL(14,2),
    "notes" TEXT,
    "metadata" JSONB,
    "created_by_user_id" TEXT,
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_conferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_conference_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "conference_id" TEXT NOT NULL,
    "stock_item_id" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_of_measure" TEXT,
    "unit_cost" DECIMAL(14,4),
    "total_cost" DECIMAL(14,2),
    "divergence_type" TEXT,
    "mapping_status" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_conference_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_receipts_company_id_idx" ON "purchase_receipts"("company_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_company_id_branch_id_idx" ON "purchase_receipts"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_company_id_supplier_id_idx" ON "purchase_receipts"("company_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_company_id_purchase_order_id_idx" ON "purchase_receipts"("company_id", "purchase_order_id");

-- CreateIndex
CREATE INDEX "purchase_receipts_company_id_status_idx" ON "purchase_receipts"("company_id", "status");

-- CreateIndex
CREATE INDEX "purchase_receipts_company_id_created_at_idx" ON "purchase_receipts"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_receipts_company_id_fiscal_key_key" ON "purchase_receipts"("company_id", "fiscal_key");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_company_id_idx" ON "purchase_receipt_items"("company_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_company_id_branch_id_idx" ON "purchase_receipt_items"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_receipt_id_idx" ON "purchase_receipt_items"("receipt_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_stock_item_id_idx" ON "purchase_receipt_items"("stock_item_id");

-- CreateIndex
CREATE INDEX "purchase_receipt_items_purchase_order_item_id_idx" ON "purchase_receipt_items"("purchase_order_item_id");

-- CreateIndex
CREATE INDEX "purchase_quotes_company_id_idx" ON "purchase_quotes"("company_id");

-- CreateIndex
CREATE INDEX "purchase_quotes_company_id_supplier_id_idx" ON "purchase_quotes"("company_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchase_quotes_company_id_stock_item_id_idx" ON "purchase_quotes"("company_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "purchase_quotes_company_id_status_idx" ON "purchase_quotes"("company_id", "status");

-- CreateIndex
CREATE INDEX "purchase_quotes_valid_until_idx" ON "purchase_quotes"("valid_until");

-- CreateIndex
CREATE INDEX "purchase_conferences_company_id_idx" ON "purchase_conferences"("company_id");

-- CreateIndex
CREATE INDEX "purchase_conferences_company_id_branch_id_idx" ON "purchase_conferences"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "purchase_conferences_company_id_status_idx" ON "purchase_conferences"("company_id", "status");

-- CreateIndex
CREATE INDEX "purchase_conferences_company_id_source_type_idx" ON "purchase_conferences"("company_id", "source_type");

-- CreateIndex
CREATE INDEX "purchase_conferences_company_id_created_at_idx" ON "purchase_conferences"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_conferences_company_id_fiscal_key_key" ON "purchase_conferences"("company_id", "fiscal_key");

-- CreateIndex
CREATE INDEX "purchase_conference_items_company_id_idx" ON "purchase_conference_items"("company_id");

-- CreateIndex
CREATE INDEX "purchase_conference_items_company_id_branch_id_idx" ON "purchase_conference_items"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "purchase_conference_items_conference_id_idx" ON "purchase_conference_items"("conference_id");

-- CreateIndex
CREATE INDEX "purchase_conference_items_stock_item_id_idx" ON "purchase_conference_items"("stock_item_id");

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_quotes" ADD CONSTRAINT "purchase_quotes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_conference_items" ADD CONSTRAINT "purchase_conference_items_conference_id_fkey" FOREIGN KEY ("conference_id") REFERENCES "purchase_conferences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
