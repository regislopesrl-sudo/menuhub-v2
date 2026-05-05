-- Add an independent Kiosk/Totem availability flag while preserving current behavior.
-- Existing rows inherit the current counter/PDV availability so no product visibility changes on deploy.
ALTER TABLE "products"
ADD COLUMN "available_kiosk" BOOLEAN NOT NULL DEFAULT true;

UPDATE "products"
SET "available_kiosk" = "available_counter";
