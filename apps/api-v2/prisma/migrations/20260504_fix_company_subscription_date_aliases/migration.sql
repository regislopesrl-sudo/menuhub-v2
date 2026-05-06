ALTER TABLE IF EXISTS "company_subscriptions"
  ADD COLUMN IF NOT EXISTS "starts_at" TIMESTAMP(3);

ALTER TABLE IF EXISTS "company_subscriptions"
  ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3);

UPDATE "company_subscriptions"
SET "starts_at" = COALESCE("starts_at", "started_at")
WHERE "started_at" IS NOT NULL;

UPDATE "company_subscriptions"
SET "ends_at" = COALESCE("ends_at", "ended_at")
WHERE "ended_at" IS NOT NULL;
