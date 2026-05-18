-- CreateTable
CREATE TABLE "product_recipes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "yield_quantity" DECIMAL(14,4),
    "yield_unit" TEXT,
    "total_cost" DECIMAL(14,2),
    "cost_data_status" TEXT NOT NULL DEFAULT 'NO_DATA',
    "notes" TEXT,
    "metadata" JSONB,
    "created_by_user_id" TEXT,
    "activated_by_user_id" TEXT,
    "activated_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recipe_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "loss_percent" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "effective_quantity" DECIMAL(14,4),
    "unit_cost" DECIMAL(14,4),
    "total_cost" DECIMAL(14,2),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recipe_cost_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "recipe_version" INTEGER NOT NULL,
    "sale_price" DECIMAL(14,2),
    "total_cost" DECIMAL(14,2),
    "cmv_percent" DECIMAL(8,4),
    "gross_margin" DECIMAL(14,2),
    "gross_margin_percent" DECIMAL(8,4),
    "cost_data_status" TEXT NOT NULL DEFAULT 'NO_DATA',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_recipe_cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_recipes_company_id_idx" ON "product_recipes"("company_id");

-- CreateIndex
CREATE INDEX "product_recipes_company_id_product_id_idx" ON "product_recipes"("company_id", "product_id");

-- CreateIndex
CREATE INDEX "product_recipes_company_id_status_idx" ON "product_recipes"("company_id", "status");

-- CreateIndex
CREATE INDEX "product_recipes_company_id_cost_data_status_idx" ON "product_recipes"("company_id", "cost_data_status");

-- CreateIndex
CREATE INDEX "product_recipes_company_id_created_at_idx" ON "product_recipes"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_recipes_company_id_product_id_version_key" ON "product_recipes"("company_id", "product_id", "version");

-- CreateIndex
CREATE INDEX "product_recipe_items_company_id_idx" ON "product_recipe_items"("company_id");

-- CreateIndex
CREATE INDEX "product_recipe_items_company_id_product_id_idx" ON "product_recipe_items"("company_id", "product_id");

-- CreateIndex
CREATE INDEX "product_recipe_items_recipe_id_idx" ON "product_recipe_items"("recipe_id");

-- CreateIndex
CREATE INDEX "product_recipe_items_stock_item_id_idx" ON "product_recipe_items"("stock_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_recipe_items_recipe_id_stock_item_id_key" ON "product_recipe_items"("recipe_id", "stock_item_id");

-- CreateIndex
CREATE INDEX "product_recipe_cost_snapshots_company_id_idx" ON "product_recipe_cost_snapshots"("company_id");

-- CreateIndex
CREATE INDEX "product_recipe_cost_snapshots_company_id_product_id_idx" ON "product_recipe_cost_snapshots"("company_id", "product_id");

-- CreateIndex
CREATE INDEX "product_recipe_cost_snapshots_recipe_id_idx" ON "product_recipe_cost_snapshots"("recipe_id");

-- CreateIndex
CREATE INDEX "product_recipe_cost_snapshots_company_id_cost_data_status_idx" ON "product_recipe_cost_snapshots"("company_id", "cost_data_status");

-- CreateIndex
CREATE INDEX "product_recipe_cost_snapshots_created_at_idx" ON "product_recipe_cost_snapshots"("created_at");

-- AddForeignKey
ALTER TABLE "product_recipe_items" ADD CONSTRAINT "product_recipe_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "product_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_cost_snapshots" ADD CONSTRAINT "product_recipe_cost_snapshots_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "product_recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
