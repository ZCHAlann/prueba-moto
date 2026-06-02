CREATE TYPE "public"."company_status_enum" AS ENUM('active', 'inactive', 'suspended', 'trial');--> statement-breakpoint
CREATE TYPE "public"."lead_status_enum" AS ENUM('nuevo', 'contactado', 'demo_agendada', 'propuesta_enviada', 'ganado', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."plan_tier_enum" AS ENUM('free', 'starter', 'pro', 'enterprise');--> statement-breakpoint
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
ALTER TABLE "companies" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."company_status_enum";--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "status" SET DATA TYPE "public"."company_status_enum" USING "status"::"public"."company_status_enum";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "industry" varchar(80);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "country" varchar(80);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "city" varchar(80);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_name" varchar(160);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_email" varchar(160);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contact_phone" varchar(40);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "website" varchar(255);--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contract_start_at" date;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "contract_end_at" date;--> statement-breakpoint
ALTER TABLE "platform_audit_entries" ADD CONSTRAINT "platform_audit_entries_actor_id_platform_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_leads" ADD CONSTRAINT "platform_leads_assigned_to_platform_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_leads" ADD CONSTRAINT "platform_leads_converted_to_company_id_companies_id_fk" FOREIGN KEY ("converted_to_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_insurance_policies" ADD CONSTRAINT "company_insurance_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_insurance_policies" ADD CONSTRAINT "company_insurance_policies_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_plan_id_platform_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE no action ON UPDATE no action;