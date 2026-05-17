-- CreateTable
CREATE TABLE "branch_sales_imports" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "original_file_name" TEXT,
    "file_hash" TEXT,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed_rows" INTEGER NOT NULL DEFAULT 0,
    "failed_rows" INTEGER NOT NULL DEFAULT 0,
    "data_status" TEXT NOT NULL DEFAULT 'NO_DATA',
    "error_summary" JSONB,
    "metadata" JSONB,
    "created_by_user_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_sales_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_sales_import_rows" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "import_id" TEXT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "external_order_id" TEXT,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_sales_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imported_sales_history" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "import_id" TEXT,
    "import_row_id" TEXT,
    "external_order_id" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'IMPORTED_HISTORY',
    "sale_date" TIMESTAMP(3) NOT NULL,
    "channel" TEXT,
    "payment_method" TEXT,
    "operator_id" TEXT,
    "waiter_id" TEXT,
    "customer_id" TEXT,
    "product_id" TEXT,
    "product_name" TEXT,
    "category_id" TEXT,
    "category_name" TEXT,
    "quantity" DECIMAL(14,4),
    "gross_amount" DECIMAL(14,2),
    "discount_amount" DECIMAL(14,2),
    "net_amount" DECIMAL(14,2),
    "cost_amount" DECIMAL(14,2),
    "cmv_percent" DECIMAL(8,4),
    "data_status" TEXT NOT NULL DEFAULT 'PARTIAL_DATA',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_sales_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "report_key" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "data_status" TEXT NOT NULL DEFAULT 'NO_DATA',
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "generated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "metric_key" TEXT NOT NULL,
    "metric_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "numeric_value" DECIMAL(18,4),
    "text_value" TEXT,
    "data_status" TEXT NOT NULL DEFAULT 'NO_DATA',
    "dimensions" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_sales_imports_company_id_idx" ON "branch_sales_imports"("company_id");

-- CreateIndex
CREATE INDEX "branch_sales_imports_company_id_branch_id_idx" ON "branch_sales_imports"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "branch_sales_imports_company_id_status_idx" ON "branch_sales_imports"("company_id", "status");

-- CreateIndex
CREATE INDEX "branch_sales_imports_company_id_period_start_period_end_idx" ON "branch_sales_imports"("company_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "branch_sales_imports_company_id_created_at_idx" ON "branch_sales_imports"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "branch_sales_imports_company_id_branch_id_file_hash_key" ON "branch_sales_imports"("company_id", "branch_id", "file_hash");

-- CreateIndex
CREATE INDEX "branch_sales_import_rows_company_id_idx" ON "branch_sales_import_rows"("company_id");

-- CreateIndex
CREATE INDEX "branch_sales_import_rows_company_id_branch_id_idx" ON "branch_sales_import_rows"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "branch_sales_import_rows_import_id_idx" ON "branch_sales_import_rows"("import_id");

-- CreateIndex
CREATE INDEX "branch_sales_import_rows_company_id_status_idx" ON "branch_sales_import_rows"("company_id", "status");

-- CreateIndex
CREATE INDEX "branch_sales_import_rows_external_order_id_idx" ON "branch_sales_import_rows"("external_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_sales_import_rows_import_id_row_number_key" ON "branch_sales_import_rows"("import_id", "row_number");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_idx" ON "imported_sales_history"("company_id");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_branch_id_idx" ON "imported_sales_history"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_branch_id_sale_date_idx" ON "imported_sales_history"("company_id", "branch_id", "sale_date");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_channel_idx" ON "imported_sales_history"("company_id", "channel");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_payment_method_idx" ON "imported_sales_history"("company_id", "payment_method");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_product_id_idx" ON "imported_sales_history"("company_id", "product_id");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_category_id_idx" ON "imported_sales_history"("company_id", "category_id");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_operator_id_idx" ON "imported_sales_history"("company_id", "operator_id");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_waiter_id_idx" ON "imported_sales_history"("company_id", "waiter_id");

-- CreateIndex
CREATE INDEX "imported_sales_history_company_id_data_status_idx" ON "imported_sales_history"("company_id", "data_status");

-- CreateIndex
CREATE UNIQUE INDEX "imported_sales_history_company_id_branch_id_external_order__key" ON "imported_sales_history"("company_id", "branch_id", "external_order_id", "product_id", "sale_date");

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_idx" ON "report_snapshots"("company_id");

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_branch_id_idx" ON "report_snapshots"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_report_key_idx" ON "report_snapshots"("company_id", "report_key");

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_report_type_idx" ON "report_snapshots"("company_id", "report_type");

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_period_start_period_end_idx" ON "report_snapshots"("company_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "report_snapshots_company_id_data_status_idx" ON "report_snapshots"("company_id", "data_status");

-- CreateIndex
CREATE INDEX "report_snapshots_created_at_idx" ON "report_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "metric_snapshots_company_id_idx" ON "metric_snapshots"("company_id");

-- CreateIndex
CREATE INDEX "metric_snapshots_company_id_branch_id_idx" ON "metric_snapshots"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "metric_snapshots_company_id_metric_key_idx" ON "metric_snapshots"("company_id", "metric_key");

-- CreateIndex
CREATE INDEX "metric_snapshots_company_id_metric_type_idx" ON "metric_snapshots"("company_id", "metric_type");

-- CreateIndex
CREATE INDEX "metric_snapshots_company_id_period_start_period_end_idx" ON "metric_snapshots"("company_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "metric_snapshots_company_id_data_status_idx" ON "metric_snapshots"("company_id", "data_status");

-- CreateIndex
CREATE INDEX "metric_snapshots_created_at_idx" ON "metric_snapshots"("created_at");

-- AddForeignKey
ALTER TABLE "branch_sales_import_rows" ADD CONSTRAINT "branch_sales_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "branch_sales_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_sales_history" ADD CONSTRAINT "imported_sales_history_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "branch_sales_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imported_sales_history" ADD CONSTRAINT "imported_sales_history_import_row_id_fkey" FOREIGN KEY ("import_row_id") REFERENCES "branch_sales_import_rows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
