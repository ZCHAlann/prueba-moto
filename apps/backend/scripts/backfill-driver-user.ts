// scripts/backfill-driver-user.ts
//
// Backfill: para cada company_users con role='conductor' en cualquier
// empresa, asegurar que exista su fila en company_drivers.
//
// Se ejecuta ANTES de aplicar la migración 0003. Si encuentra duplicados
// (1 user con 2 drivers), conserva el de menor id y deslinkea los demás.
//
// Idempotente: corre N veces y queda igual.

import { config } from "dotenv";
config();
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  console.log("Backfill conductor→driver…");

  // 1) Encontrar todos los companyUsers con role=conductor
  const conductors = await pool.query<{ id: number; company_id: number; username: string; email: string }>(
    `SELECT id, company_id, username, email FROM company_users WHERE role = 'conductor'`,
  );
  console.log(`Conductores encontrados: ${conductors.rowCount}`);

  let created = 0, kept = 0, dedup = 0;

  for (const cu of conductors.rows) {
    // ¿Existe ya un driver row con este userId?
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM company_drivers WHERE company_id = $1 AND user_id = $2`,
      [cu.company_id, cu.id],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      kept += 1;
      continue;
    }

    // ¿Existe un driver row huérfano (con code que matchea) o sin userId
    // que pueda ser "el" de este conductor? Si hay uno huérfano, le
    // seteamos userId. Si no, creamos uno nuevo.
    const orphan = await pool.query<{ id: number }>(
      `SELECT id FROM company_drivers
       WHERE company_id = $1 AND user_id IS NULL
         AND (email = $2 OR first_name || ' ' || last_name ILIKE $3)
       ORDER BY id LIMIT 1`,
      [cu.company_id, cu.email, `%${cu.username.split(/\s+/)[0]}%`],
    );

    if (orphan.rowCount) {
      await pool.query(
        `UPDATE company_drivers SET user_id = $1 WHERE id = $2`,
        [cu.id, orphan.rows[0]!.id],
      );
      kept += 1;
      continue;
    }

    // Crear nuevo
    const name = (cu.username || "Conductor").split(/\s+/);
    const firstName = name[0] ?? "Conductor";
    const lastName  = name.slice(1).join(" ") || "—";
    const code      = `COND-${cu.id}`;
    try {
      await pool.query(
        `INSERT INTO company_drivers (company_id, user_id, code, first_name, last_name, email, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'Activo', NOW(), NOW())`,
        [cu.company_id, cu.id, code, firstName, lastName, cu.email],
      );
      created += 1;
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") {
        // race / already exists — fine
        dedup += 1;
        continue;
      }
      throw e;
    }
  }

  console.log(`\nResultado:`);
  console.log(`  Ya enlazados:    ${kept}`);
  console.log(`  Creados nuevos:  ${created}`);
  console.log(`  Saltados (race): ${dedup}`);

  // 2) Drivers huérfanos con userId apuntando a un user que ya no es
  //    conductor: limpiarlos (userId = NULL)
  const orphans = await pool.query<{ id: number; user_id: number; user_role: string }>(
    `SELECT d.id, d.user_id, u.role AS user_role
     FROM company_drivers d
     JOIN company_users u ON u.id = d.user_id
     WHERE u.role <> 'conductor'`,
  );
  console.log(`\nDrivers con user que NO es conductor: ${orphans.rowCount}`);
  for (const o of orphans.rows) {
    await pool.query(`UPDATE company_drivers SET user_id = NULL WHERE id = $1`, [o.id]);
    console.log(`  · driver=${o.id} user=${o.user_id} (role=${o.user_role}) → userId NULL`);
  }

  // 3) Resumen final
  const sum = await pool.query<{ total: number; with_user: number; without_user: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE user_id IS NOT NULL)::int AS with_user,
            count(*) FILTER (WHERE user_id IS NULL)::int    AS without_user
     FROM company_drivers`,
  );
  console.log(`\nResumen company_drivers:`);
  console.log(`  total:      ${sum.rows[0]!.total}`);
  console.log(`  con userId: ${sum.rows[0]!.with_user}`);
  console.log(`  sin userId: ${sum.rows[0]!.without_user}`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
