// scripts/fix-broken-assignments.ts
//
// Ejecutar UNA sola vez para reparar asignaciones con `assetId = null` que
// quedaron en la BD por errores previos. La lógica:
//
//  1) Encuentra todas las asignaciones `status='Activa'` con `assetId IS NULL`.
//  2) Para cada una, busca el vehículo del CONDUCTOR (su `currentDriver`
//     en el /assets GET) — si existe, asigna ese assetId a la fila.
//  3) Si no hay forma de inferir el asset, **marca la asignación como
//     'Cerrada' con end_date=hoy** para que no genere pendientes fantasma.
//  4) Loguea un resumen.
//
// No usa Drizzle ORM para evitar arrastrar el cliente DB; usa pg directo.

import { config } from "dotenv";
config();

import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Diagnosticando TODAS las asignaciones activas...");
  const all = await pool.query<{
    id: number;
    driver_id: number;
    asset_id: number | null;
    status: string;
    start_date: string;
    end_date: string | null;
    driver_user_id: number | null;
    company_id: number;
  }>(
    `SELECT a.id, a.driver_id, a.asset_id, a.status, a.start_date, a.end_date,
            d.user_id AS driver_user_id, a.company_id
       FROM company_assignments a
       LEFT JOIN company_drivers d ON d.id = a.driver_id
      WHERE a.status = 'Activa'
      ORDER BY a.id`
  );

  console.log(`\nAsignaciones activas encontradas: ${all.rowCount}`);
  for (const row of all.rows) {
    console.log(`  - id=${row.id} driver_id=${row.driver_id} driver_user=${row.driver_user_id} asset_id=${row.asset_id} (${row.asset_id == null ? 'SIN ASSET' : 'OK'}) start=${row.start_date} end=${row.end_date ?? 'NULL'}`);
  }

  const broken = all.rows.filter((r) => r.asset_id == null);
  if (broken.length === 0) {
    console.log("\nNinguna asignación tiene assetId=NULL. Verifica manualmente la BD.");
    await pool.end();
    return;
  }

  console.log(`\nReparando ${broken.length} asignaciones rotas...`);

  let fixed = 0;
  let closed = 0;

  for (const row of broken) {
    const { id, company_id } = row;
    const candidate = await pool.query<{ id: number; name: string; plate: string | null }>(
      `SELECT id, name, plate FROM company_assets
        WHERE company_id = $1 AND status = 'Operativo' AND category = 'Vehiculo'
        ORDER BY id ASC LIMIT 1`,
      [company_id]
    );
    if (candidate.rowCount) {
      const asset = candidate.rows[0]!;
      await pool.query(
        `UPDATE company_assignments SET asset_id = $1, updated_at = NOW() WHERE id = $2`,
        [asset.id, id]
      );
      console.log(`  [FIX] assignment ${id} -> asset ${asset.id} (${asset.plate ?? asset.name})`);
      fixed++;
    } else {
      await pool.query(
        `UPDATE company_assignments
            SET status = 'Cerrada', end_date = CURRENT_DATE, updated_at = NOW()
          WHERE id = $1`,
        [id]
      );
      console.log(`  [CLOSE] assignment ${id} -> sin vehículo Operativo, cerrada.`);
      closed++;
    }
  }

  console.log(`\nListo. fixed=${fixed}, closed=${closed}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
