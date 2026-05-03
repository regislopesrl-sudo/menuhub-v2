CREATE TABLE "company_configurations" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "brand_color" TEXT,
  "timezone" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "public_title" TEXT,
  "public_description" TEXT,
  "banner_url" TEXT,
  "closed_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_configurations_company_id_key" ON "company_configurations"("company_id");

ALTER TABLE "company_configurations"
ADD CONSTRAINT "company_configurations_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
