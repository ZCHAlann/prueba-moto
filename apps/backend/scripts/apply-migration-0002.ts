// scripts/apply-migration-0002.ts
//
// Aplica la migración 0002_company_exit_authorizations.sql de manera
// idempotente (no rompe si la tabla/columna ya existe).

import { config } from "dotenv";
config();
import { Pool } from "pg";
import * as fs from "node:fs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync("drizzle/0002_company_exit_authorizations.sql", "utf8");

async function execIgnoring(label: string, q: string) {
  try {
    await pool.query(q);
    console.log(`  ✓ ${label}`);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "42P07") { console.log(`  · ${label} (ya existía, skip)`); return; }
    if (err.code === "42701") { console.log(`  · ${label} (columna ya existía, skip)`); return; }
    if (err.code === "42710") { console.log(`  · ${label} (constraint ya existía, skip)`); return; }
    if (err.code === "42P06") { console.log(`  · ${label} (schema ya existía, skip)`); return; }
    if (err.message?.includes("already exists")) { console.log(`  · ${label} (already exists, skip)`); return; }
    throw e;
  }
}

async function main() {
  console.log("Aplicando migración 0002…");

  await execIgnoring("CREATE TYPE exit_authorization_status_enum", `CREATE TYPE "public"."exit_authorization_status_enum" AS ENUM('Pendiente', 'Autorizada', 'Rechazada')`);

  await execIgnoring("CREATE TABLE company_exit_authorizations", `
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
    )
  `);

  // company_checklists nullable column defaults
  for (const stmt of [
    [`ALTER COLUMN target_kind SET DEFAULT 'Vehiculo'`, `ALTER TABLE "company_checklists" ALTER COLUMN "target_kind" SET DEFAULT 'Vehiculo'`],
    [`SET NOT NULL target_kind`,                       `ALTER TABLE "company_checklists" ALTER COLUMN "target_kind" SET NOT NULL`],
    [`SET DEFAULT '' target_label`,                    `ALTER TABLE "company_checklists" ALTER COLUMN "target_label" SET DEFAULT ''`],
    [`SET NOT NULL target_label`,                      `ALTER TABLE "company_checklists" ALTER COLUMN "target_label" SET NOT NULL`],
    [`SET DEFAULT now() date`,                         `ALTER TABLE "company_checklists" ALTER COLUMN "date" SET DEFAULT now()`],
    [`SET NOT NULL status`,                            `ALTER TABLE "company_checklists" ALTER COLUMN "status" SET NOT NULL`],
    [`SET NOT NULL items`,                             `ALTER TABLE "company_checklists" ALTER COLUMN "items" SET NOT NULL`],
    [`SET NOT NULL photo_urls`,                        `ALTER TABLE "company_checklists" ALTER COLUMN "photo_urls" SET NOT NULL`],
  ] as const) {
    await execIgnoring(stmt[0], stmt[1]);
  }

  // FKs
  for (const [label, q] of [
    ["FK company_id → companies.id", `ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action`],
    ["FK asset_id → company_assets.id", `ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_asset_id_company_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."company_assets"("id") ON DELETE restrict ON UPDATE no action`],
    ["FK driver_id → company_drivers.id", `ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_driver_id_company_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."company_drivers"("id") ON DELETE restrict ON UPDATE no action`],
    ["FK decision_by_user_id → company_users.id", `ALTER TABLE "company_exit_authorizations" ADD CONSTRAINT "company_exit_authorizations_decision_by_user_id_company_users_id_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."company_users"("id") ON DELETE set null ON UPDATE no action`],
  ] as const) {
    await execIgnoring(label, q);
  }

  // Marcar migración como aplicada en drizzle
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
       id SERIAL PRIMARY KEY,
       hash TEXT NOT NULL,
       created_at BIGINT
     )`,
  );
  const migCount = await pool.query(
    `SELECT count(*)::int AS c FROM "__drizzle_migrations" WHERE hash = $1`,
    ["0002_company_exit_authorizations"],
  );
  if (migCount.rows[0]?.c === 0) {
    await pool.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      ["0002_company_exit_authorizations", Date.now()],
    );
    console.log("  ✓ Drizzle migrations table: 0002 marcada como aplicada");
  } else {
    console.log("  · Drizzle migrations table: 0002 ya estaba marcada");
  }

  console.log("\nMigración aplicada.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
