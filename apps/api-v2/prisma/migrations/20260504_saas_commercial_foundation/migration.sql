DO $$ BEGIN
  CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "document" TEXT,
  ADD COLUMN IF NOT EXISTS "slug" TEXT,
  ADD COLUMN IF NOT EXISTS "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_key" ON "companies"("slug");

CREATE TABLE IF NOT EXISTS "plans" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_key_key" ON "plans"("key");

CREATE TABLE IF NOT EXISTS "plan_modules" (
  "id" TEXT PRIMARY KEY,
  "plan_id" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "limits" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_modules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "plan_modules_plan_id_module_key_key" ON "plan_modules"("plan_id", "module_key");
CREATE INDEX IF NOT EXISTS "plan_modules_module_key_idx" ON "plan_modules"("module_key");
ALTER TABLE "plan_modules" ADD COLUMN IF NOT EXISTS "limits" JSONB;

CREATE TABLE IF NOT EXISTS "company_subscriptions" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3),
  "trial_ends_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "company_subscriptions"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "company_subscriptions"
    ALTER COLUMN "status" TYPE "SubscriptionStatus"
    USING CASE
      WHEN "status" IN ('ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELED', 'EXPIRED') THEN "status"::"SubscriptionStatus"
      ELSE 'ACTIVE'::"SubscriptionStatus"
    END;
EXCEPTION
  WHEN undefined_column THEN null;
  WHEN datatype_mismatch THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "company_subscriptions_company_id_status_starts_at_idx" ON "company_subscriptions"("company_id", "status", "started_at");
CREATE INDEX IF NOT EXISTS "company_subscriptions_plan_id_idx" ON "company_subscriptions"("plan_id");

CREATE TABLE IF NOT EXISTS "company_module_overrides" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "enabled" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_module_overrides_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_module_overrides_company_id_module_key_key" ON "company_module_overrides"("company_id", "module_key");
CREATE INDEX IF NOT EXISTS "company_module_overrides_module_key_idx" ON "company_module_overrides"("module_key");

CREATE TABLE IF NOT EXISTS "company_module_audit_logs" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "user_id" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_module_audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "company_module_audit_logs_company_id_created_at_idx" ON "company_module_audit_logs"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "company_module_audit_logs_module_key_created_at_idx" ON "company_module_audit_logs"("module_key", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "company_subscriptions_active_company_unique"
ON "company_subscriptions"("company_id")
WHERE "status" = 'ACTIVE';
