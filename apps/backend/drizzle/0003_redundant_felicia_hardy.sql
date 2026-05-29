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
ALTER TABLE "company_oil_changes" ADD CONSTRAINT "company_oil_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_changes" ADD CONSTRAINT "company_oil_changes_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_changes" ADD CONSTRAINT "company_oil_changes_oil_type_id_company_oil_types_id_fk" FOREIGN KEY ("oil_type_id") REFERENCES "public"."company_oil_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_oil_types" ADD CONSTRAINT "company_oil_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;