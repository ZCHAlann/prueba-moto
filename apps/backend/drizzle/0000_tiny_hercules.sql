CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"plan_id" varchar(40) DEFAULT 'free' NOT NULL,
	"status" varchar(40) DEFAULT 'active' NOT NULL,
	"enabled_modules" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "company_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"email" varchar(160) NOT NULL,
	"username" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(40) NOT NULL,
	"status" varchar(40) DEFAULT 'active' NOT NULL,
	"profile_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_users_company_id_email" UNIQUE("company_id","email"),
	CONSTRAINT "company_users_company_id_username" UNIQUE("company_id","username")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(160) NOT NULL,
	"username" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(40) NOT NULL,
	"status" varchar(40) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_users_email_unique" UNIQUE("email"),
	CONSTRAINT "platform_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "company_ac_refrigerant_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"unit_id" serial NOT NULL,
	"date" date NOT NULL,
	"refrigerant_type" varchar(60),
	"quantity" numeric(8, 2),
	"unit" varchar(10),
	"technician" varchar(160),
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_ac_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"unit_id" serial NOT NULL,
	"date" date NOT NULL,
	"kind" varchar(60),
	"technician" varchar(160),
	"cost" numeric(10, 2),
	"findings" text,
	"photo_urls" text[] DEFAULT '{}',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_ac_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"site_id" integer,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(60),
	"floor" varchar(40),
	"area" varchar(80),
	"serial" varchar(120),
	"brand" varchar(120),
	"model" varchar(120),
	"capacity_btu" varchar(40),
	"voltage" varchar(40),
	"amperage" varchar(40),
	"refrigerant_type" varchar(40),
	"install_date" date,
	"technician" varchar(160),
	"status" varchar(60),
	"last_service" date,
	"next_service" date,
	"photo_urls" text[] DEFAULT '{}',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_ac_units_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "company_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" integer,
	"title" varchar(160) NOT NULL,
	"type" varchar(80),
	"severity" varchar(20),
	"status" varchar(40) DEFAULT 'Abierta',
	"due_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"site_id" integer,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"asset_type" varchar(40),
	"category" varchar(80),
	"status" varchar(40) DEFAULT 'Operativo',
	"responsible" varchar(160),
	"brand" varchar(120),
	"model" varchar(120),
	"serial" varchar(120),
	"plate" varchar(40),
	"year" varchar(10),
	"color" varchar(60),
	"max_load" varchar(40),
	"fuel_type" varchar(40),
	"oil_type" varchar(80),
	"oil_capacity" varchar(40),
	"location" varchar(160),
	"availability" varchar(80),
	"observations" text,
	"photo_urls" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_assets_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "company_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" serial NOT NULL,
	"driver_id" serial NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" varchar(40) DEFAULT 'Activa',
	"notes" text,
	"handover_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_audit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer,
	"entity" varchar(80) NOT NULL,
	"entity_id" varchar(80),
	"action" varchar(40) NOT NULL,
	"actor_id" integer,
	"actor_name" varchar(160),
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_checklist_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"items" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"category_id" integer,
	"asset_id" integer,
	"driver_id" integer,
	"inspector_id" integer,
	"target_kind" varchar(40),
	"target_label" varchar(160),
	"date" date NOT NULL,
	"status" varchar(40) DEFAULT 'Pendiente',
	"summary" text,
	"findings" text,
	"items" jsonb DEFAULT '[]'::jsonb,
	"photo_urls" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"site_id" integer,
	"user_id" integer,
	"code" varchar(40) NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"email" varchar(160),
	"phone" varchar(40),
	"license_number" varchar(80),
	"license_type" varchar(40),
	"license_expiry" date,
	"license_points" integer DEFAULT 0,
	"status" varchar(40) DEFAULT 'Activo',
	"notes" text,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_drivers_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "company_fuel_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" serial NOT NULL,
	"driver_id" integer,
	"date" date NOT NULL,
	"liters" numeric(10, 2) NOT NULL,
	"cost" numeric(10, 2),
	"odometer" numeric(12, 2),
	"station" varchar(160),
	"fuel_type" varchar(40),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_garages" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"location" varchar(160),
	"capacity" integer,
	"supervisor" varchar(160),
	"status" varchar(40),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_garages_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "company_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"category" varchar(80),
	"stock" numeric(12, 2),
	"min_stock" numeric(12, 2),
	"location" varchar(160),
	"unit" varchar(40),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_inventory_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "company_maintenances" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" serial NOT NULL,
	"title" varchar(160) NOT NULL,
	"kind" varchar(40),
	"priority" varchar(40),
	"status" varchar(40) DEFAULT 'Pendiente',
	"scheduled_date" date,
	"due_date" date,
	"completed_date" date,
	"technician" varchar(160),
	"cost" numeric(12, 2),
	"photo_urls" text[] DEFAULT '{}',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_settings" (
	"company_id" serial PRIMARY KEY NOT NULL,
	"maintenance_lead_time_days" integer DEFAULT 7,
	"checklist_required" boolean DEFAULT true,
	"fuel_currency" varchar(10) DEFAULT 'USD',
	"alert_email" varchar(160),
	"alert_configs" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"city" varchar(120),
	"address" text,
	"contact" varchar(160),
	"status" varchar(40) DEFAULT 'Activa',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_sites_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "oil_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" integer,
	"technician_id" integer,
	"nivel" varchar(20),
	"color" varchar(20),
	"confianza" varchar(10),
	"puede_salir" boolean DEFAULT false,
	"observaciones" text,
	"accion_recomendada" text,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ac_refrigerant_logs" ADD CONSTRAINT "company_ac_refrigerant_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ac_refrigerant_logs" ADD CONSTRAINT "company_ac_refrigerant_logs_unit_id_company_ac_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."company_ac_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ac_services" ADD CONSTRAINT "company_ac_services_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ac_services" ADD CONSTRAINT "company_ac_services_unit_id_company_ac_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."company_ac_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ac_units" ADD CONSTRAINT "company_ac_units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_ac_units" ADD CONSTRAINT "company_ac_units_site_id_company_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."company_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_alerts" ADD CONSTRAINT "company_alerts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_alerts" ADD CONSTRAINT "company_alerts_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_site_id_company_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."company_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD CONSTRAINT "company_assignments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD CONSTRAINT "company_assignments_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assignments" ADD CONSTRAINT "company_assignments_driver_id_company_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."company_drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_audit_entries" ADD CONSTRAINT "company_audit_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_checklist_categories" ADD CONSTRAINT "company_checklist_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_checklists" ADD CONSTRAINT "company_checklists_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_checklists" ADD CONSTRAINT "company_checklists_category_id_company_checklist_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."company_checklist_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_checklists" ADD CONSTRAINT "company_checklists_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_checklists" ADD CONSTRAINT "company_checklists_driver_id_company_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."company_drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_checklists" ADD CONSTRAINT "company_checklists_inspector_id_company_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_drivers" ADD CONSTRAINT "company_drivers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_drivers" ADD CONSTRAINT "company_drivers_site_id_company_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."company_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_drivers" ADD CONSTRAINT "company_drivers_user_id_company_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fuel_entries" ADD CONSTRAINT "company_fuel_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fuel_entries" ADD CONSTRAINT "company_fuel_entries_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_fuel_entries" ADD CONSTRAINT "company_fuel_entries_driver_id_company_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."company_drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_garages" ADD CONSTRAINT "company_garages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_inventory" ADD CONSTRAINT "company_inventory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_maintenances" ADD CONSTRAINT "company_maintenances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_maintenances" ADD CONSTRAINT "company_maintenances_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sites" ADD CONSTRAINT "company_sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_checks" ADD CONSTRAINT "oil_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_checks" ADD CONSTRAINT "oil_checks_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_checks" ADD CONSTRAINT "oil_checks_technician_id_company_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;