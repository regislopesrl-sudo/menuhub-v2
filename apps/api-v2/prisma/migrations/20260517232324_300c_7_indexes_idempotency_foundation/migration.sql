-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_branch_id_idempotency_key_key" ON "cash_movements"("branch_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "financial_ledger_entries_branch_id_idempotency_key_key" ON "financial_ledger_entries"("branch_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payable_settlements_branch_id_idempotency_key_key" ON "payable_settlements"("branch_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_settlements_branch_id_idempotency_key_key" ON "receivable_settlements"("branch_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_document_key" ON "suppliers"("company_id", "document");

