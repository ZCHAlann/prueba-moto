import { config } from "dotenv";
config();
import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await p.query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'company_drivers'::regclass
      AND contype = 'f'
    ORDER BY conname
  `);
  for (const row of r.rows) console.log(row.conname, "->", row.def);
  await p.end();
})();
