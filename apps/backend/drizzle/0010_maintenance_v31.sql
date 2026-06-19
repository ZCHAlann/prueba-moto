-- ───────────────────────────────────────────────────────────────────
-- Mantenimientos v3.1:
--  * Mano de obra (labor_cost) separada de los repuestos.
--  * Tipo 'Lavada' (servicio de lavado con sus propios campos).
--  * Tablas nuevas: company_maintenance_carwash_extras y
--    company_maintenance_carwash_photos.
-- ───────────────────────────────────────────────────────────────────

-- 1) Mano de obra en la tabla principal
ALTER TABLE "company_maintenance_records"
  ADD COLUMN "labor_cost" numeric(12, 2) NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 2) Campos específicos de Lavada en la tabla principal
ALTER TABLE "company_maintenance_records"
  ADD COLUMN "carwash_location" varchar(200),
  ADD COLUMN "carwash_provider" varchar(200),
  ADD COLUMN "carwash_notes"    text;
--> statement-breakpoint

-- 3) Enum de tipo: agregar 'Lavada' (sin perder los valores actuales)
ALTER TYPE "maintenance_type_enum" ADD VALUE IF NOT EXISTS 'Lavada';
--> statement-breakpoint

-- 4) Tabla de adicionales de Lavada (items extra que el operador carga)
CREATE TABLE "company_maintenance_carwash_extras" (
  "id"              serial PRIMARY KEY NOT NULL,
  "maintenance_id"  integer NOT NULL,
  "name"            varchar(180) NOT NULL,
  "quantity"        numeric(10, 2) NOT NULL DEFAULT 1,
  "unit_cost"       numeric(12, 2) NOT NULL DEFAULT 0,
  "subtotal"        numeric(12, 2) NOT NULL DEFAULT 0,
  "photo_url"       text,
  "created_at"      timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "company_maintenance_carwash_extras"
  ADD CONSTRAINT "company_maintenance_carwash_extras_maintenance_id_company_maintenance_records_id_fk"
  FOREIGN KEY ("maintenance_id") REFERENCES "public"."company_maintenance_records"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "company_maintenance_carwash_extras_maintenance_id_idx"
  ON "company_maintenance_carwash_extras" USING btree ("maintenance_id");
--> statement-breakpoint

-- 5) Tabla de fotos del servicio de Lavada
CREATE TABLE "company_maintenance_carwash_photos" (
  "id"                serial PRIMARY KEY NOT NULL,
  "maintenance_id"    integer NOT NULL,
  "photo_url"         text NOT NULL,
  "caption"           varchar(200),
  "uploaded_by"       integer,
  "uploaded_by_name"  varchar(160),
  "created_at"        timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "company_maintenance_carwash_photos"
  ADD CONSTRAINT "company_maintenance_carwash_photos_maintenance_id_company_maintenance_records_id_fk"
  FOREIGN KEY ("maintenance_id") REFERENCES "public"."company_maintenance_records"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "company_maintenance_carwash_photos"
  ADD CONSTRAINT "company_maintenance_carwash_photos_uploaded_by_company_users_id_fk"
  FOREIGN KEY ("uploaded_by") REFERENCES "public"."company_users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "company_maintenance_carwash_photos_maintenance_id_idx"
  ON "company_maintenance_carwash_photos" USING btree ("maintenance_id");
