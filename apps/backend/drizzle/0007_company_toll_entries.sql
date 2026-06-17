CREATE TABLE "company_toll_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"driver_id" integer,
	"date" date NOT NULL,
	"toll_name" varchar(200) NOT NULL,
	"category" varchar(40),
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(40),
	"route" varchar(200),
	"odometer" numeric(12, 2),
	"axes" integer,
	"notes" text,
	"photo_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_toll_entries" ADD CONSTRAINT "company_toll_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_toll_entries" ADD CONSTRAINT "company_toll_entries_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_toll_entries" ADD CONSTRAINT "company_toll_entries_driver_id_company_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."company_drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_toll_entries_company_id_date_idx" ON "company_toll_entries" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "company_toll_entries_company_id_asset_id_idx" ON "company_toll_entries" USING btree ("company_id","asset_id");
