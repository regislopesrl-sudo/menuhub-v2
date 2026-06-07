CREATE TABLE IF NOT EXISTS "delivery_zones" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "delivery_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "minimum_order_amount" DECIMAL(14,2),
  "estimated_minutes_min" INTEGER,
  "estimated_minutes_max" INTEGER,
  "base_latitude" DECIMAL(10,7),
  "base_longitude" DECIMAL(10,7),
  "radius_km" DECIMAL(10,3),
  "fee_per_km" DECIMAL(14,4),
  "max_distance_km" DECIMAL(10,3),
  "courier_fee" DECIMAL(14,2),
  "courier_fee_type" TEXT,
  "is_blocked_area" BOOLEAN NOT NULL DEFAULT false,
  "blocked_reason" TEXT,
  "requires_manual_negotiation" BOOLEAN NOT NULL DEFAULT false,
  "negotiation_channel" TEXT,
  "negotiation_message" TEXT,
  "visible_on_delivery_site" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "metadata" JSONB,
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMP(3),
  CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "delivery_zone_neighborhoods" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "zone_id" TEXT NOT NULL,
  "neighborhood" TEXT NOT NULL,
  "alias" TEXT,
  "normalized_neighborhood" TEXT,
  "normalized_alias" TEXT,
  "city" TEXT,
  "state" TEXT,
  "delivery_fee_override" DECIMAL(14,2),
  "minimum_order_override" DECIMAL(14,2),
  "courier_fee_override" DECIMAL(14,2),
  "estimated_minutes_min" INTEGER,
  "estimated_minutes_max" INTEGER,
  "visible_on_delivery_site" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zone_neighborhoods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zone_neighborhoods_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "delivery_zone_postal_code_ranges" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "zone_id" TEXT NOT NULL,
  "postal_code_start" TEXT NOT NULL,
  "postal_code_end" TEXT NOT NULL,
  "delivery_fee_override" DECIMAL(14,2),
  "minimum_order_override" DECIMAL(14,2),
  "courier_fee_override" DECIMAL(14,2),
  "estimated_minutes_min" INTEGER,
  "estimated_minutes_max" INTEGER,
  "visible_on_delivery_site" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zone_postal_code_ranges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zone_postal_code_ranges_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "delivery_zone_polygon_points" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "zone_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zone_polygon_points_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zone_polygon_points_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "delivery_zone_schedules" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "zone_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'ACTIVE_WINDOW',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zone_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zone_schedules_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "delivery_zone_dynamic_pricing_rules" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "zone_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "day_of_week" INTEGER,
  "start_time" TEXT,
  "end_time" TEXT,
  "adjustment_type" TEXT NOT NULL,
  "adjustment_amount" DECIMAL(14,2) NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_zone_dynamic_pricing_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_zone_dynamic_pricing_rules_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "delivery_address_validation_logs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "zone_id" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "postal_code" TEXT,
  "neighborhood" TEXT,
  "city" TEXT,
  "state" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "distance_km" DECIMAL(10,3),
  "delivery_fee" DECIMAL(14,2),
  "courier_fee" DECIMAL(14,2),
  "minimum_order_amount" DECIMAL(14,2),
  "estimated_minutes_min" INTEGER,
  "estimated_minutes_max" INTEGER,
  "requires_manual_negotiation" BOOLEAN NOT NULL DEFAULT false,
  "dynamic_pricing_applied" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT NOT NULL DEFAULT 'CHECKOUT',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_address_validation_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_address_validation_logs_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "delivery_zones_company_id_idx" ON "delivery_zones"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_zones_company_id_branch_id_idx" ON "delivery_zones"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_zones_company_id_branch_id_status_idx" ON "delivery_zones"("company_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "delivery_zones_company_id_branch_id_type_idx" ON "delivery_zones"("company_id", "branch_id", "type");
CREATE INDEX IF NOT EXISTS "delivery_zones_company_id_branch_id_priority_idx" ON "delivery_zones"("company_id", "branch_id", "priority");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zones_company_id_branch_id_name_key" ON "delivery_zones"("company_id", "branch_id", "name");

CREATE INDEX IF NOT EXISTS "delivery_zone_neighborhoods_company_id_idx" ON "delivery_zone_neighborhoods"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_neighborhoods_company_id_branch_id_idx" ON "delivery_zone_neighborhoods"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_neighborhoods_zone_id_idx" ON "delivery_zone_neighborhoods"("zone_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_neighborhoods_company_id_branch_id_neighborhood_idx" ON "delivery_zone_neighborhoods"("company_id", "branch_id", "neighborhood");
CREATE INDEX IF NOT EXISTS "delivery_zone_neighborhoods_company_id_branch_id_normalized_neighborhood_idx" ON "delivery_zone_neighborhoods"("company_id", "branch_id", "normalized_neighborhood");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zone_neighborhoods_zone_id_neighborhood_city_state_key" ON "delivery_zone_neighborhoods"("zone_id", "neighborhood", "city", "state");

CREATE INDEX IF NOT EXISTS "delivery_zone_postal_code_ranges_company_id_idx" ON "delivery_zone_postal_code_ranges"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_postal_code_ranges_company_id_branch_id_idx" ON "delivery_zone_postal_code_ranges"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_postal_code_ranges_zone_id_idx" ON "delivery_zone_postal_code_ranges"("zone_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_postal_code_ranges_postal_code_start_idx" ON "delivery_zone_postal_code_ranges"("postal_code_start");
CREATE INDEX IF NOT EXISTS "delivery_zone_postal_code_ranges_postal_code_end_idx" ON "delivery_zone_postal_code_ranges"("postal_code_end");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zone_postal_code_ranges_zone_id_postal_code_start_postal_code_end_key" ON "delivery_zone_postal_code_ranges"("zone_id", "postal_code_start", "postal_code_end");

CREATE INDEX IF NOT EXISTS "delivery_zone_polygon_points_company_id_idx" ON "delivery_zone_polygon_points"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_polygon_points_company_id_branch_id_idx" ON "delivery_zone_polygon_points"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_polygon_points_zone_id_idx" ON "delivery_zone_polygon_points"("zone_id");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zone_polygon_points_zone_id_sort_order_key" ON "delivery_zone_polygon_points"("zone_id", "sort_order");

CREATE INDEX IF NOT EXISTS "delivery_zone_schedules_company_id_idx" ON "delivery_zone_schedules"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_schedules_company_id_branch_id_idx" ON "delivery_zone_schedules"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_schedules_zone_id_idx" ON "delivery_zone_schedules"("zone_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_schedules_day_of_week_idx" ON "delivery_zone_schedules"("day_of_week");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_zone_schedules_zone_id_day_of_week_start_time_end_time_mode_key" ON "delivery_zone_schedules"("zone_id", "day_of_week", "start_time", "end_time", "mode");

CREATE INDEX IF NOT EXISTS "delivery_zone_dynamic_pricing_rules_company_id_idx" ON "delivery_zone_dynamic_pricing_rules"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_dynamic_pricing_rules_company_id_branch_id_idx" ON "delivery_zone_dynamic_pricing_rules"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_dynamic_pricing_rules_zone_id_idx" ON "delivery_zone_dynamic_pricing_rules"("zone_id");
CREATE INDEX IF NOT EXISTS "delivery_zone_dynamic_pricing_rules_company_id_branch_id_status_idx" ON "delivery_zone_dynamic_pricing_rules"("company_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "delivery_zone_dynamic_pricing_rules_day_of_week_idx" ON "delivery_zone_dynamic_pricing_rules"("day_of_week");

CREATE INDEX IF NOT EXISTS "delivery_address_validation_logs_company_id_idx" ON "delivery_address_validation_logs"("company_id");
CREATE INDEX IF NOT EXISTS "delivery_address_validation_logs_company_id_branch_id_idx" ON "delivery_address_validation_logs"("company_id", "branch_id");
CREATE INDEX IF NOT EXISTS "delivery_address_validation_logs_company_id_branch_id_status_idx" ON "delivery_address_validation_logs"("company_id", "branch_id", "status");
CREATE INDEX IF NOT EXISTS "delivery_address_validation_logs_zone_id_idx" ON "delivery_address_validation_logs"("zone_id");
CREATE INDEX IF NOT EXISTS "delivery_address_validation_logs_postal_code_idx" ON "delivery_address_validation_logs"("postal_code");
CREATE INDEX IF NOT EXISTS "delivery_address_validation_logs_created_at_idx" ON "delivery_address_validation_logs"("created_at");
