ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';

CREATE TABLE "subscription_status_events" (
  "id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "from_status" "SubscriptionStatus",
  "to_status" "SubscriptionStatus" NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_status_events_subscription_id_created_at_idx"
ON "subscription_status_events"("subscription_id", "created_at");

ALTER TABLE "subscription_status_events"
ADD CONSTRAINT "subscription_status_events_subscription_id_fkey"
FOREIGN KEY ("subscription_id") REFERENCES "company_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invoice_status_events" (
  "id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "from_status" "InvoiceStatus",
  "to_status" "InvoiceStatus" NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_status_events_invoice_id_created_at_idx"
ON "invoice_status_events"("invoice_id", "created_at");

ALTER TABLE "invoice_status_events"
ADD CONSTRAINT "invoice_status_events_invoice_id_fkey"
FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
