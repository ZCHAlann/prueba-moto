import { config } from "dotenv";
config();
import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const cs = await p.query(`SELECT conname, contype FROM pg_constraint WHERE conrelid = 'company_drivers'::regclass ORDER BY conname`);
  console.log("Constraints on company_drivers:");
  for (const r of cs.rows) console.log("  ", r.conname, "|", r.contype);

  const ix = await p.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'company_drivers' ORDER BY indexname`);
  console.log("\nIndexes on company_drivers:");
  for (const r of ix.rows) console.log("  ", r.indexname, "|", r.indexdef);

  await p.end();
})();
