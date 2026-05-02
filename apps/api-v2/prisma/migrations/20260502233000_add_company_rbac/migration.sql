CREATE TABLE "company_roles" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_permissions" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_role_permissions" (
  "role_id" TEXT NOT NULL,
  "permission_id" TEXT NOT NULL,

  CONSTRAINT "company_role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

CREATE TABLE "company_user_roles" (
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role_id" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_user_roles_pkey" PRIMARY KEY ("company_id","user_id","role_id")
);

CREATE UNIQUE INDEX "company_roles_company_id_key_key" ON "company_roles"("company_id","key");
CREATE UNIQUE INDEX "company_roles_company_id_id_key" ON "company_roles"("company_id","id");
CREATE INDEX "company_roles_company_id_idx" ON "company_roles"("company_id");
CREATE UNIQUE INDEX "company_permissions_key_key" ON "company_permissions"("key");
CREATE INDEX "company_role_permissions_permission_id_idx" ON "company_role_permissions"("permission_id");
CREATE INDEX "company_user_roles_user_id_idx" ON "company_user_roles"("user_id");
CREATE INDEX "company_user_roles_role_id_idx" ON "company_user_roles"("role_id");
CREATE INDEX "company_user_roles_company_id_idx" ON "company_user_roles"("company_id");

ALTER TABLE "company_roles"
ADD CONSTRAINT "company_roles_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_role_permissions"
ADD CONSTRAINT "company_role_permissions_role_id_fkey"
FOREIGN KEY ("role_id") REFERENCES "company_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_role_permissions"
ADD CONSTRAINT "company_role_permissions_permission_id_fkey"
FOREIGN KEY ("permission_id") REFERENCES "company_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_user_roles"
ADD CONSTRAINT "company_user_roles_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_user_roles"
ADD CONSTRAINT "company_user_roles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "company_user_roles"
ADD CONSTRAINT "company_user_roles_company_id_role_id_fkey"
FOREIGN KEY ("company_id", "role_id") REFERENCES "company_roles"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
