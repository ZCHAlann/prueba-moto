// scripts/diag-step.ts
import { config } from "dotenv";
config();
import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r = await p.query(`SELECT id, company_id, user_id FROM company_drivers WHERE user_id = 5 AND company_id = 1`);
  console.log("drivers de cu=5:", r.rows);
  const r2 = await p.query(`SELECT id, company_id, role, status FROM company_users WHERE id = 5`);
  console.log("cu=5:", r2.rows);
  const r3 = await p.query(`SELECT id, driver_id, asset_id, status, start_date, end_date FROM company_assignments WHERE company_id = 1 AND driver_id = 3`);
  console.log("asignaciones driver=3:", r3.rows);
  await p.end();
})();
