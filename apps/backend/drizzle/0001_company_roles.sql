CREATE TABLE "company_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"key" varchar(60) NOT NULL,
	"label" varchar(80) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"palette" varchar(40) DEFAULT 'Esmeralda' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_roles_company_id_key" UNIQUE("company_id","key")
);
--> statement-breakpoint
ALTER TABLE "company_roles" ADD CONSTRAINT "company_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;