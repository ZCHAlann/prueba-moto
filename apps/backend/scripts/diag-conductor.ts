// scripts/diag-conductor.ts
import { config } from "dotenv";
config();
import { Pool } from "pg";
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const r = await p.query(`
      SELECT
        ast.id    AS asset_id,
        ast.plate,
        ast.brand,
        ast.model
      FROM company_assignments a
      JOIN company_assets ast
        ON ast.id = a.asset_id
       AND ast.company_id = a.company_id
      WHERE a.company_id = 1
        AND a.driver_id  = 3
        AND a.start_date <= CURRENT_DATE
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        AND a.status = 'Activa'
      ORDER BY a.start_date DESC
      LIMIT 1
    `);
    console.log("query OK, rows:", r.rows);
  } catch (e) {
    console.error("FAIL:", e);
  }
  await p.end();
})();
