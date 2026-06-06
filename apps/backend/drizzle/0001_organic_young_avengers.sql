ALTER TABLE "company_users" ADD COLUMN "module_permissions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "acta_number" varchar(40);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "acta_date" date;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "acta_time" varchar(10);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "acta_place" varchar(160);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "acta_area" varchar(120);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "driver_dni" varchar(40);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "driver_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "driver_role" varchar(120);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "vehicle_odometer" varchar(40);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "vehicle_fuel_level" varchar(40);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "vehicle_condition" varchar(80);--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "novedades" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "accesorios" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "novedades_text" text;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "signature_log_url" text;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "signature_resp_url" text;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD COLUMN "vehicle_photo_urls" text[] DEFAULT '{}';