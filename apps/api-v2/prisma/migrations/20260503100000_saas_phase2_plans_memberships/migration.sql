-- Phase 2 SaaS: plans/modules persistence + memberships

CREATE TABLE IF NOT EXISTS "plans" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "plan_modules" (
  "id" TEXT PRIMARY KEY,
  "plan_id" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "admin_only" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_modules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "plan_modules_plan_id_module_key_key" UNIQUE ("plan_id", "module_key")
);

CREATE INDEX IF NOT EXISTS "plan_modules_module_key_idx" ON "plan_modules"("module_key");

CREATE TABLE IF NOT EXISTS "plan_limits" (
  "id" TEXT PRIMARY KEY,
  "plan_id" TEXT NOT NULL,
  "limit_key" TEXT NOT NULL,
  "limit_value" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_limits_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "plan_limits_plan_id_limit_key_key" UNIQUE ("plan_id", "limit_key")
);

CREATE TABLE IF NOT EXISTS "company_subscriptions" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "plan_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_subscriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "company_subscriptions_company_id_status_idx" ON "company_subscriptions"("company_id", "status");

CREATE TABLE IF NOT EXISTS "company_module_overrides" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_module_overrides_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_module_overrides_company_id_module_key_key" UNIQUE ("company_id", "module_key")
);

CREATE INDEX IF NOT EXISTS "company_module_overrides_module_key_idx" ON "company_module_overrides"("module_key");

CREATE TABLE IF NOT EXISTS "user_company_memberships" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "role_key" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_company_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_company_memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_company_memberships_user_id_company_id_key" UNIQUE ("user_id", "company_id")
);

CREATE INDEX IF NOT EXISTS "user_company_memberships_company_id_is_active_idx" ON "user_company_memberships"("company_id", "is_active");


