DO $$ BEGIN
  CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "billing_accounts" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL UNIQUE,
  "billing_email" TEXT NOT NULL,
  "document" TEXT,
  "legal_name" TEXT,
  "address_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "subscription_id" TEXT,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
  "amount_cents" INTEGER NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "paid_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "invoices_company_id_status_due_date_idx" ON "invoices"("company_id", "status", "due_date");
CREATE INDEX IF NOT EXISTS "invoices_subscription_id_idx" ON "invoices"("subscription_id");

CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id" TEXT PRIMARY KEY,
  "invoice_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_amount_cents" INTEGER NOT NULL,
  "total_amount_cents" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

CREATE TABLE IF NOT EXISTS "payment_attempts" (
  "id" TEXT PRIMARY KEY,
  "invoice_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_payment_id" TEXT,
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PENDING',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "payment_attempts_invoice_id_status_idx" ON "payment_attempts"("invoice_id", "status");
CREATE INDEX IF NOT EXISTS "payment_attempts_provider_provider_payment_id_idx" ON "payment_attempts"("provider", "provider_payment_id");

CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
  "id" TEXT PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload_json" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_webhook_events_provider_event_id_key" ON "billing_webhook_events"("provider", "event_id");
CREATE INDEX IF NOT EXISTS "billing_webhook_events_provider_created_at_idx" ON "billing_webhook_events"("provider", "created_at");
