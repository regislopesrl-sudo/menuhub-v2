-- CreateTable
CREATE TABLE "inventory_item_categories" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_item_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit_of_measure" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "average_cost" DECIMAL(14,4),
    "minimum_stock" DECIMAL(14,4),
    "maximum_stock" DECIMAL(14,4),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock_balances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_cost" DECIMAL(14,4),
    "total_cost" DECIMAL(14,2),
    "source_type" TEXT,
    "source_id" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "started_by_user_id" TEXT,
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "count_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "expected_quantity" DECIMAL(14,4),
    "counted_quantity" DECIMAL(14,4) NOT NULL,
    "difference_quantity" DECIMAL(14,4),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "average_cost_history" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "stock_item_id" TEXT NOT NULL,
    "previous_cost" DECIMAL(14,4),
    "new_cost" DECIMAL(14,4) NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "average_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_item_categories_company_id_idx" ON "inventory_item_categories"("company_id");

-- CreateIndex
CREATE INDEX "inventory_item_categories_company_id_branch_id_idx" ON "inventory_item_categories"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "inventory_item_categories_company_id_status_idx" ON "inventory_item_categories"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_item_categories_company_id_branch_id_name_key" ON "inventory_item_categories"("company_id", "branch_id", "name");

-- CreateIndex
CREATE INDEX "inventory_items_company_id_idx" ON "inventory_items"("company_id");

-- CreateIndex
CREATE INDEX "inventory_items_company_id_category_id_idx" ON "inventory_items"("company_id", "category_id");

-- CreateIndex
CREATE INDEX "inventory_items_company_id_status_idx" ON "inventory_items"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_company_id_sku_key" ON "inventory_items"("company_id", "sku");

-- CreateIndex
CREATE INDEX "inventory_stock_balances_company_id_idx" ON "inventory_stock_balances"("company_id");

-- CreateIndex
CREATE INDEX "inventory_stock_balances_company_id_branch_id_idx" ON "inventory_stock_balances"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "inventory_stock_balances_company_id_stock_item_id_idx" ON "inventory_stock_balances"("company_id", "stock_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_balances_company_id_branch_id_stock_item_id_key" ON "inventory_stock_balances"("company_id", "branch_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_company_id_idx" ON "inventory_movements"("company_id");

-- CreateIndex
CREATE INDEX "inventory_movements_company_id_branch_id_idx" ON "inventory_movements"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "inventory_movements_company_id_stock_item_id_idx" ON "inventory_movements"("company_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_company_id_branch_id_created_at_idx" ON "inventory_movements"("company_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_source_type_source_id_idx" ON "inventory_movements"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "inventory_counts_company_id_idx" ON "inventory_counts"("company_id");

-- CreateIndex
CREATE INDEX "inventory_counts_company_id_branch_id_idx" ON "inventory_counts"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "inventory_counts_company_id_status_idx" ON "inventory_counts"("company_id", "status");

-- CreateIndex
CREATE INDEX "inventory_counts_company_id_branch_id_created_at_idx" ON "inventory_counts"("company_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_count_items_company_id_idx" ON "inventory_count_items"("company_id");

-- CreateIndex
CREATE INDEX "inventory_count_items_company_id_branch_id_idx" ON "inventory_count_items"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "inventory_count_items_count_id_idx" ON "inventory_count_items"("count_id");

-- CreateIndex
CREATE INDEX "inventory_count_items_stock_item_id_idx" ON "inventory_count_items"("stock_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_items_count_id_stock_item_id_key" ON "inventory_count_items"("count_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "average_cost_history_company_id_idx" ON "average_cost_history"("company_id");

-- CreateIndex
CREATE INDEX "average_cost_history_company_id_branch_id_idx" ON "average_cost_history"("company_id", "branch_id");

-- CreateIndex
CREATE INDEX "average_cost_history_company_id_stock_item_id_idx" ON "average_cost_history"("company_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "average_cost_history_source_type_source_id_idx" ON "average_cost_history"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "average_cost_history_created_at_idx" ON "average_cost_history"("created_at");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "inventory_item_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock_balances" ADD CONSTRAINT "inventory_stock_balances_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "inventory_counts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "average_cost_history" ADD CONSTRAINT "average_cost_history_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
