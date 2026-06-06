DROP INDEX IF EXISTS "coupons_code_key";

CREATE UNIQUE INDEX IF NOT EXISTS "coupons_company_id_code_key"
  ON "coupons" ("company_id", "code");
