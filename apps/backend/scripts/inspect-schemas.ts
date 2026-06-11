// scripts/inspect-schemas.ts
import { config } from "dotenv";
config();
import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  for (const t of ["platform_users", "company_users", "company_drivers", "company_assets", "company_assignments", "companies"]) {
    const r = await p.query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [t]);
    console.log(`\n--- ${t} ---`);
    for (const row of r.rows) {
      console.log(`  ${row.column_name.padEnd(28)} | ${row.data_type.padEnd(20)} | ${row.is_nullable.padEnd(3)} | ${row.column_default ?? ""}`);
    }
  }
  await p.end();
})();
