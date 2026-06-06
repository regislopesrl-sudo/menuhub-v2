ALTER TABLE "recipes"
  ADD COLUMN IF NOT EXISTS "preparation_summary" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
