// scripts/smoke-driver-sync.ts
//
// Valida la opción B: cuando un companyUser es creado con role=conductor,
// se crea/asegura automáticamente su fila en company_drivers.
//
// Pasos:
//   1) Login como admin
//   2) POST /users con role=conductor (crea companyUser)
//   3) Verificar que company_drivers tiene una fila con user_id=<nuevo>
//   4) PATCH role=supervisor
//   5) Verificar que la fila del driver SE BORRÓ
//   6) PATCH role=conductor (de nuevo)
//   7) Verificar que la fila SE RECREÓ
//   8) DELETE user
//   9) Verificar que la fila del driver se borró (FK CASCADE)
//
//   X) Cada paso usa el cookie JWT del admin.

import { config } from "dotenv";
config();
import { Pool } from "pg";

const BACKEND = "http://localhost:5000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function loginAdmin(): Promise<{ token: string; companyId: number }> {
  // Necesitamos un admin. Lo sembramos on-the-fly.
  const email = "admin-driver-sync@aplismart.test";
  const password = "test1234";
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.default.hash(password, 10);
  const company = (await pool.query<{ id: number }>(`SELECT id FROM companies ORDER BY id LIMIT 1`)).rows[0]!;
  const existing = await pool.query<{ id: number }>(`SELECT id FROM company_users WHERE email = $1 AND company_id = $2`, [email, company.id]);
  let cuId: number;
  if (existing.rowCount) {
    cuId = existing.rows[0]!.id;
    await pool.query(`UPDATE company_users SET password_hash = $1, role = 'admin_empresa', status = 'active' WHERE id = $2`, [hash, cuId]);
  } else {
    const r = await pool.query<{ id: number }>(
      `INSERT INTO company_users (company_id, email, username, password_hash, status, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 'admin_empresa', NOW(), NOW()) RETURNING id`,
      [company.id, email, "admin-driver-sync", hash],
    );
    cuId = r.rows[0]!.id;
  }
  console.log(`  · admin: cu=${cuId} ${email}`);

  const res = await fetch(`${BACKEND}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password, scope: "operacion" }),
  });
  if (!res.ok) throw new Error(`admin login: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/(?:^|,\s*)([^;=\s]+)=([^;]+)/g) ?? [];
  let token = "";
  for (const part of m) {
    const mm = part.trim().match(/^([^;=\s]+)=(.+)$/);
    if (mm?.[1] === "aplismart_token") { token = `${mm[1]}=${mm[2]}`; break; }
  }
  return { token, companyId: company.id };
}

async function api(token: string, method: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? undefined : await res.json();
  return { status: res.status, data };
}

const ts = Date.now();
const email = `sync-test-${ts}@aplismart.test`;

async function main() {
  console.log("=== Smoke: sync 1-a-1 company_users ↔ company_drivers ===\n");
  const { token, companyId } = await loginAdmin();

  // 1) Crear user con role=conductor
  console.log(`1) POST /users { role: conductor, email: ${email} }`);
  const create = await api<{ id: string }>(token, "POST", `/company/${companyId}/users`, {
    email,
    username: `sync-test-${ts}`,
    password: "test1234",
    role: "conductor",
    status: "active",
  });
  console.log(`   status=${create.status}`);
  if (create.status !== 201) throw new Error(`esperaba 201, obtuve ${create.status} ${JSON.stringify(create.data)}`);
  const userId = Number(String((create.data as { id: string }).id).replace(/^company-user-/, ""));
  const userIdStr = `company-user-${userId}`;
  console.log(`   ✓ userId=${userId} (${userIdStr})`);

  // 2) Verificar que existe driver row
  console.log(`\n2) Verificar driver row para userId=${userId}`);
  const d1 = await pool.query<{ id: number; code: string; status: string }>(
    `SELECT id, code, status FROM company_drivers WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId],
  );
  console.log(`   rows=${d1.rowCount} ${JSON.stringify(d1.rows[0])}`);
  if (!d1.rowCount) throw new Error(`expected driver row, none found`);
  const driverId = d1.rows[0]!.id;

  // 3) PATCH a supervisor
  console.log(`\n3) PATCH /users/${userIdStr} { role: 'supervisor' }`);
  const patch1 = await api(token, "PUT", `/company/${companyId}/users/${userIdStr}`, { role: "supervisor" });
  console.log(`   status=${patch1.status}`);
  if (patch1.status !== 200) throw new Error(`PATCH esperaba 200, obtuve ${patch1.status}`);

  console.log(`\n4) Driver row debería haberse borrado:`);
  const d2 = await pool.query<{ id: number }>(
    `SELECT id FROM company_drivers WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId],
  );
  console.log(`   rows=${d2.rowCount}`);
  if (d2.rowCount) throw new Error(`expected 0 driver rows, found ${d2.rowCount}`);

  // 4) PATCH a conductor de nuevo
  console.log(`\n5) PATCH /users/${userIdStr} { role: 'conductor' } (de nuevo)`);
  const patch2 = await api(token, "PUT", `/company/${companyId}/users/${userIdStr}`, { role: "conductor" });
  console.log(`   status=${patch2.status}`);
  if (patch2.status !== 200) throw new Error(`PATCH esperaba 200, obtuve ${patch2.status}`);

  console.log(`\n6) Driver row debería haberse recreado:`);
  const d3 = await pool.query<{ id: number; code: string }>(
    `SELECT id, code FROM company_drivers WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId],
  );
  console.log(`   rows=${d3.rowCount} ${JSON.stringify(d3.rows[0])}`);
  if (!d3.rowCount) throw new Error(`expected 1 driver row, found ${d3.rowCount}`);
  if (d3.rows[0]!.id !== driverId) console.log(`   (id cambió: ${driverId} → ${d3.rows[0]!.id}, esperable si la fila anterior tenía un code en uso)`);

  // 5) DELETE
  console.log(`\n7) DELETE /users/${userIdStr}`);
  const del = await api(token, "DELETE", `/company/${companyId}/users/${userIdStr}`);
  console.log(`   status=${del.status}`);
  if (del.status !== 200 && del.status !== 204) throw new Error(`DELETE esperaba 200/204, obtuve ${del.status}`);

  console.log(`\n8) Driver row debería haberse borrado (FK CASCADE):`);
  const d4 = await pool.query<{ id: number }>(
    `SELECT id FROM company_drivers WHERE user_id = $1 AND company_id = $2`,
    [userId, companyId],
  );
  console.log(`   rows=${d4.rowCount}`);
  if (d4.rowCount) throw new Error(`expected 0 driver rows after DELETE, found ${d4.rowCount}`);

  console.log(`\n=== Sync 1-a-1: PASS ===`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(`\nFAIL: ${e.message}`);
  // Cleanup defensivo
  try { await pool.query(`DELETE FROM company_users WHERE email = $1`, [email]); } catch {}
  await pool.end();
  process.exit(1);
});
