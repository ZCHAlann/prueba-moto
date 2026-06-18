-- ───────────────────────────────────────────────────────────────────
-- Mantenimientos v3: asignación, eventos (timeline), categorías
-- custom y soporte de reprogramación.
-- ───────────────────────────────────────────────────────────────────

-- 1) Columnas nuevas en company_maintenance_records
ALTER TABLE "company_maintenance_records"
  ADD COLUMN "assigned_user_id" integer REFERENCES "public"."company_users"("id") ON DELETE set null,
  ADD COLUMN "taken_at" timestamp,
  ADD COLUMN "is_reprogrammed" boolean NOT NULL DEFAULT false,
  ADD COLUMN "reprogram_reason" text,
  ADD COLUMN "reprogrammed_at" timestamp,
  ADD COLUMN "reprogram_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX "company_maintenance_records_company_id_assigned_user_id_idx"
  ON "company_maintenance_records" USING btree ("company_id","assigned_user_id");
--> statement-breakpoint
CREATE INDEX "company_maintenance_records_company_id_status_scheduled_for_idx"
  ON "company_maintenance_records" USING btree ("company_id","status","scheduled_for");
--> statement-breakpoint

-- 2) Tabla de eventos (línea de tiempo)
CREATE TABLE "company_maintenance_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "maintenance_id" integer NOT NULL,
  "kind" varchar(40) NOT NULL,
  "actor_user_id" integer REFERENCES "public"."company_users"("id") ON DELETE set null,
  "actor_name" varchar(160),
  "payload" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_maintenance_events" ADD CONSTRAINT "company_maintenance_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_maintenance_events" ADD CONSTRAINT "company_maintenance_events_maintenance_id_company_maintenance_records_id_fk" FOREIGN KEY ("maintenance_id") REFERENCES "public"."company_maintenance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_maintenance_events" ADD CONSTRAINT "company_maintenance_events_actor_user_id_company_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_maintenance_events_maintenance_id_created_at_idx"
  ON "company_maintenance_events" USING btree ("maintenance_id","created_at");
--> statement-breakpoint

-- 3) Categorías custom por empresa
CREATE TABLE "company_maintenance_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "company_id" integer NOT NULL,
  "key" varchar(60) NOT NULL,
  "label" varchar(120) NOT NULL,
  "short_label" varchar(40),
  "color" varchar(20) DEFAULT 'sky',
  "icon" varchar(40) DEFAULT 'wrench',
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "company_maintenance_categories_company_id_key" UNIQUE("company_id","key")
);
--> statement-breakpoint
ALTER TABLE "company_maintenance_categories" ADD CONSTRAINT "company_maintenance_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
