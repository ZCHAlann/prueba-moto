// scripts/apply-migration-0004.ts
import { config } from "dotenv";
config();
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  await pool.query(`ALTER TABLE company_fuel_entries ADD COLUMN IF NOT EXISTS photo_url text;`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)`,
  );
  const c = await pool.query(
    `SELECT count(*)::int AS c FROM "__drizzle_migrations" WHERE hash = $1`,
    ["0004_fuel_photo"],
  );
  if (c.rows[0]?.c === 0) {
    await pool.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      ["0004_fuel_photo", Date.now()],
    );
    console.log("✓ Migración 0004_fuel_photo aplicada");
  } else {
    console.log("· Migración 0004_fuel_photo ya estaba marcada");
  }
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
