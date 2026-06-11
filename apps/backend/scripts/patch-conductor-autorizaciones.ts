// scripts/patch-conductor-autorizaciones.ts
//
// Parcha el rol "conductor" en todas las empresas para sumarle el
// módulo 'autorizaciones' con permisos ver/crear.

import { config } from "dotenv";
config();
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const res = await pool.query<{ id: number; company_id: number; key: string; permissions: unknown }>(
    `SELECT id, company_id, key, permissions FROM company_roles WHERE key = 'conductor'`,
  );
  for (const row of res.rows) {
    const perms = (row.permissions ?? {}) as Record<string, Record<string, string[]>>;
    const cur = perms.autorizaciones ?? {};
    const curVer = cur.autorizaciones ?? [];
    const nextSub = Array.from(new Set([...curVer, "ver", "crear"]));
    perms.autorizaciones = { ...cur, autorizaciones: nextSub };
    await pool.query(`UPDATE company_roles SET permissions = $1::jsonb WHERE id = $2`, [
      JSON.stringify(perms),
      row.id,
    ]);
    console.log(`✓ Conductor en company=${row.company_id}: autorizaciones=${JSON.stringify(nextSub)}`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
