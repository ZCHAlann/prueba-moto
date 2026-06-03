CREATE TYPE "public"."billing_cycle_enum" AS ENUM('monthly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."company_status_enum" AS ENUM('active', 'inactive', 'suspended', 'trial');--> statement-breakpoint
CREATE TYPE "public"."invoice_status_enum" AS ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_status_enum" AS ENUM('nuevo', 'contactado', 'demo_agendada', 'propuesta_enviada', 'ganado', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."plan_tier_enum" AS ENUM('free', 'starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority_enum" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_status_enum" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."asset_availability_enum" AS ENUM('Disponible', 'En ruta', 'No disponible');--> statement-breakpoint
CREATE TYPE "public"."asset_category_enum" AS ENUM('Camion', 'Camioneta', 'SUV', 'Furgon', 'Furgoneta', 'Bus', 'Volqueta');--> statement-breakpoint
CREATE TYPE "public"."asset_fuel_type_enum" AS ENUM('Diesel', 'Gasolina', 'Electrico', 'Hibrido');--> statement-breakpoint
CREATE TYPE "public"."asset_status_enum" AS ENUM('Operativo', 'En mantenimiento', 'Fuera de servicio');--> statement-breakpoint
CREATE TYPE "public"."asset_type_enum" AS ENUM('Vehiculo', 'Motor', 'Maquinaria', 'Planta electrica');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"plan_id" varchar(40) DEFAULT 'free' NOT NULL,
	"status" "company_status_enum" DEFAULT 'active' NOT NULL,
	"enabled_modules" text[] DEFAULT '{}' NOT NULL,
	"industry" varchar(80),
	"country" varchar(80),
	"city" varchar(80),
	"contact_name" varchar(160),
	"contact_email" varchar(160),
	"contact_phone" varchar(40),
	"website" varchar(255),
	"notes" text,
	"trial_ends_at" timestamp,
	"contract_start_at" date,
	"contract_end_at" date,
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
	"failed_login_attempts" integer DEFAULT 0,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_users_company_id_email" UNIQUE("company_id","email"),
	CONSTRAINT "company_users_company_id_username" UNIQUE("company_id","username")
);
--> statement-breakpoint
CREATE TABLE "platform_audit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_email" varchar(160),
	"action" varchar(80) NOT NULL,
	"entity" varchar(80),
	"entity_id" varchar(80),
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"plan_id" varchar(40),
	"invoice_number" varchar(40) NOT NULL,
	"status" "invoice_status_enum" DEFAULT 'draft' NOT NULL,
	"cycle" "billing_cycle_enum" DEFAULT 'monthly' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0',
	"total" numeric(12, 2) NOT NULL,
	"issued_at" date NOT NULL,
	"due_at" date NOT NULL,
	"paid_at" date,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "platform_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" varchar(160) NOT NULL,
	"contact_name" varchar(160),
	"contact_email" varchar(160),
	"contact_phone" varchar(40),
	"industry" varchar(80),
	"country" varchar(80),
	"city" varchar(80),
	"status" "lead_status_enum" DEFAULT 'nuevo' NOT NULL,
	"source" varchar(80),
	"assigned_to" integer,
	"estimated_value" numeric(12, 2),
	"notes" text,
	"converted_to_company_id" integer,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_plans" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"tier" "plan_tier_enum" NOT NULL,
	"monthly_price" numeric(10, 2) DEFAULT '0',
	"annual_price" numeric(10, 2) DEFAULT '0',
	"max_users" integer,
	"max_assets" integer,
	"allowed_modules" text[] DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"platform_name" varchar(120) DEFAULT 'ApliSmart Motors',
	"platform_url" varchar(255),
	"support_email" varchar(160),
	"default_timezone" varchar(80) DEFAULT 'America/Guayaquil',
	"default_language" varchar(10) DEFAULT 'es',
	"password_min_length" integer DEFAULT 8,
	"password_require_upper" boolean DEFAULT true,
	"password_require_number" boolean DEFAULT true,
	"password_require_symbol" boolean DEFAULT false,
	"password_expiry_days" integer DEFAULT 0,
	"session_expiry_hours" integer DEFAULT 24,
	"max_login_attempts" integer DEFAULT 5,
	"lockout_minutes" integer DEFAULT 30,
	"smtp_host" varchar(255),
	"smtp_port" integer DEFAULT 587,
	"smtp_user" varchar(160),
	"smtp_password" text,
	"smtp_from_address" varchar(160),
	"smtp_from_name" varchar(120),
	"notify_on_new_company" boolean DEFAULT true,
	"notify_on_trial_expiring" boolean DEFAULT true,
	"notify_on_login_failure" boolean DEFAULT false,
	"default_trial_days" integer DEFAULT 14,
	"default_max_users" integer DEFAULT 5,
	"default_max_assets" integer DEFAULT 20,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "platform_ticket_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"author_platform_user_id" integer,
	"author_company_user_id" integer,
	"author_name" varchar(160),
	"author_role" varchar(40),
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"created_by" integer,
	"assigned_to" integer,
	"ticket_number" varchar(40) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status_enum" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority_enum" DEFAULT 'medium' NOT NULL,
	"category" varchar(80),
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "platform_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(160) NOT NULL,
	"username" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(40) NOT NULL,
	"status" varchar(40) DEFAULT 'active' NOT NULL,
	"failed_login_attempts" integer DEFAULT 0,
	"locked_until" timestamp,
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
	"asset_type" "asset_type_enum",
	"category" "asset_category_enum",
	"status" "asset_status_enum" DEFAULT 'Operativo',
	"responsible" varchar(160),
	"brand" varchar(120),
	"model" varchar(120),
	"serial" varchar(120),
	"plate" varchar(40),
	"year" varchar(10),
	"color" varchar(60),
	"max_load" varchar(40),
	"fuel_type" "asset_fuel_type_enum",
	"oil_type" varchar(80),
	"oil_capacity" varchar(40),
	"location" varchar(160),
	"availability" "asset_availability_enum",
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
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_garages_company_id_code" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE "company_insurance_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" integer NOT NULL,
	"insurer" varchar(160) NOT NULL,
	"policy_number" varchar(120) NOT NULL,
	"coverage" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" varchar(40) DEFAULT 'Vigente',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"labor_cost" numeric(12, 2),
	"parts_cost" numeric(12, 2),
	"photo_urls" text[] DEFAULT '{}',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_oil_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"asset_id" serial NOT NULL,
	"oil_type_id" serial NOT NULL,
	"date" varchar(10) NOT NULL,
	"reading" integer NOT NULL,
	"next_reading" integer NOT NULL,
	"quantity" integer NOT NULL,
	"technician" varchar(160),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_oil_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" serial NOT NULL,
	"name" varchar(160) NOT NULL,
	"brand" varchar(120),
	"viscosity" varchar(40),
	"application" varchar(120),
	"unit" varchar(20) DEFAULT 'gal',
	"stock" integer DEFAULT 0,
	"min_stock" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_oil_types_company_id_name" UNIQUE("company_id","name")
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
ALTER TABLE "companies" ADD CONSTRAINT "companies_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_audit_entries" ADD CONSTRAINT "platform_audit_entries_actor_id_platform_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_invoices" ADD CONSTRAINT "platform_invoices_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_leads" ADD CONSTRAINT "platform_leads_assigned_to_platform_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_leads" ADD CONSTRAINT "platform_leads_converted_to_company_id_companies_id_fk" FOREIGN KEY ("converted_to_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_platform_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ticket_messages" ADD CONSTRAINT "platform_ticket_messages_ticket_id_platform_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."platform_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ticket_messages" ADD CONSTRAINT "platform_ticket_messages_author_platform_user_id_platform_users_id_fk" FOREIGN KEY ("author_platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_ticket_messages" ADD CONSTRAINT "platform_ticket_messages_author_company_user_id_company_users_id_fk" FOREIGN KEY ("author_company_user_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tickets" ADD CONSTRAINT "platform_tickets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tickets" ADD CONSTRAINT "platform_tickets_created_by_company_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tickets" ADD CONSTRAINT "platform_tickets_assigned_to_platform_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "company_insurance_policies" ADD CONSTRAINT "company_insurance_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_insurance_policies" ADD CONSTRAINT "company_insurance_policies_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_inventory" ADD CONSTRAINT "company_inventory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_maintenances" ADD CONSTRAINT "company_maintenances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_maintenances" ADD CONSTRAINT "company_maintenances_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_changes" ADD CONSTRAINT "company_oil_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_changes" ADD CONSTRAINT "company_oil_changes_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_changes" ADD CONSTRAINT "company_oil_changes_oil_type_id_company_oil_types_id_fk" FOREIGN KEY ("oil_type_id") REFERENCES "public"."company_oil_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_types" ADD CONSTRAINT "company_oil_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sites" ADD CONSTRAINT "company_sites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_checks" ADD CONSTRAINT "oil_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_checks" ADD CONSTRAINT "oil_checks_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_checks" ADD CONSTRAINT "oil_checks_technician_id_company_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action;