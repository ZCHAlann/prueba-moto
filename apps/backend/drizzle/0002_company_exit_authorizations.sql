CREATE TYPE "public"."exit_authorization_status_enum" AS ENUM('Pendiente', 'Autorizada', 'Rechazada');--> statement-breakpoint
CREATE TABLE "company_exit_authorizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"status" "exit_authorization_status_enum" DEFAULT 'Pendiente' NOT NULL,
	"oil_bayoneta_video_url" text,
	"oil_bayoneta_video_thumb_url" text,
	"coolant_photo_url" text,
	"brake_fluid_photo_url" text,
	"tire_photos_url" text[] DEFAULT '{}' NOT NULL,
	"windshield_washer_photo_url" text,
	"lights_photo_url" text,
	"battery_photo_url" text,
	"jack_photo_url" text,
	"notes" text,
	"decision_notes" text,
	"decision_by_user_id" integer,
	"decided_at" timestamp,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "target_kind" SET DEFAULT 'Vehiculo';--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "target_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "target_label" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "target_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "date" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "items" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_checklists" ALTER COLUMN "photo_urls" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_driver_id_company_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."company_drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_decision_by_user_id_company_users_id_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;