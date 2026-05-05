CREATE TABLE IF NOT EXISTS "companies" (
  "id" TEXT PRIMARY KEY,
  "legal_name" TEXT NOT NULL,
  "trade_name" TEXT NOT NULL,
  "cnpj" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "logo_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "companies_cnpj_key" ON "companies"("cnpj");
