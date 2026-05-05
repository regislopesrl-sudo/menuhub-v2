ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "public_tracking_token" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_public_tracking_token_key"
ON "orders"("public_tracking_token");
