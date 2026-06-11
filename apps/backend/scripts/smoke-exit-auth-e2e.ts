// scripts/smoke-exit-auth-e2e.ts
//
// Smoke end-to-end del módulo Autorizaciones:
//  1) Login como CONDUCTOR  → fetchConductorContext 200
//  2) Login como SUPERVISOR (otro user)            → pending list
//  3) Crea una autorización vía POST
//  4) Verifica que el Conductor la ve con status Pendiente
//  5) Aprobar como supervisor
//  6) Verifica que el Conductor la ve con status Autorizada
//
// Crea un supervisor de prueba (no toca empresas reales distintas).

import { config } from "dotenv";
config();
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const BACKEND = "http://localhost:5000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getOrCreateSupervisor(companyId: number): Promise<{ cuId: number; email: string; password: string }> {
  const email = "supervisor-test@aplismart.test";
  const password = "test1234";
  const hash = await bcrypt.hash(password, 10);
  const ex = await pool.query<{ id: number }>(`SELECT id FROM company_users WHERE email = $1 AND company_id = $2`, [email, companyId]);
  let cuId: number;
  if (ex.rowCount) {
    cuId = ex.rows[0]!.id;
    await pool.query(`UPDATE company_users SET password_hash = $1, role = 'supervisor', status = 'active' WHERE id = $2`, [hash, cuId]);
  } else {
    const r = await pool.query<{ id: number }>(
      `INSERT INTO company_users (company_id, email, username, password_hash, status, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 'supervisor', NOW(), NOW()) RETURNING id`,
      [companyId, email, "supervisor-test", hash],
    );
    cuId = r.rows[0]!.id;
  }
  return { cuId, email, password };
}

async function login(loginField: string, password: string): Promise<{ token: string; body: { role: string; companyId: number; id: string } }> {
  const res = await fetch(`${BACKEND}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: loginField, password, scope: "operacion" }),
  });
  if (!res.ok) throw new Error(`Login ${loginField} falló: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/(?:^|,\s*)([^;=\s]+)=([^;]+)/g) ?? [];
  let token = "";
  for (const part of m) {
    const mm = part.trim().match(/^([^;=\s]+)=(.+)$/);
    if (mm?.[1] === "aplismart_token") { token = `${mm[1]}=${mm[2]}`; break; }
  }
  return { token, body: await res.json() };
}

async function api<T>(token: string, method: "GET"|"POST"|"DELETE", path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? (undefined as unknown as T) : await res.json();
  return { status: res.status, data: data as T };
}

type Ctx = { driverId: number | null; asset: { id: string; plate: string; brand: string; model: string } | null; authorizations: { id: string; status: string }[] };

async function main() {
  // 0) Crear/asegurarse de tener un supervisor de prueba en company 1
  const sup = await getOrCreateSupervisor(1);
  console.log(`Supervisor: cu=${sup.cuId} ${sup.email}`);
  // Asegurar que tenga autorizaciones con permisos
  await pool.query(
    `UPDATE company_roles SET permissions = permissions || '{"autorizaciones":{"autorizaciones":["ver","crear","editar","eliminar"]}}'::jsonb WHERE company_id = 1 AND key = 'supervisor'`,
  );

  // 1) Login Conductor
  console.log(`\n1) Login Conductor…`);
  const cond = await login("conductor-test@aplismart.test", "test1234");
  console.log(`   ✓ ${cond.body.role} / companyId=${cond.body.companyId}`);

  // 2) Login Supervisor
  console.log(`\n2) Login Supervisor…`);
  const supervisor = await login(sup.email, sup.password);
  console.log(`   ✓ ${supervisor.body.role} / companyId=${supervisor.body.companyId}`);

  // 3) Conductor → /conductor-context
  console.log(`\n3) Conductor GET /conductor-context`);
  const ctx1 = await api<Ctx>(cond.token, "GET", `/company/1/exit-authorizations/conductor-context`);
  console.log(`   status=${ctx1.status} driverId=${ctx1.data.driverId} asset=${ctx1.data.asset?.plate} auths=${ctx1.data.authorizations.length}`);
  if (ctx1.status !== 200) throw new Error("ctx1 no fue 200");
  if (!ctx1.data.driverId) throw new Error("driverId no presente");
  if (!ctx1.data.asset) throw new Error("asset no presente");

  // 4) Crear autorización
  console.log(`\n4) Conductor POST /exit-authorizations (crear solicitud)…`);
  const createRes = await api<{ id: string; status: string }>(cond.token, "POST", `/company/1/exit-authorizations`, {
    assetId:    Number(ctx1.data.asset.id),
    driverId:   ctx1.data.driverId,
    coolantPhotoUrl: "/uploads/test/coolant.jpg",
    brakeFluidPhotoUrl: "/uploads/test/brake.jpg",
    tirePhotosUrl: ["/uploads/test/tire-fl.jpg", "/uploads/test/tire-fr.jpg", "/uploads/test/tire-rl.jpg", "/uploads/test/tire-rr.jpg"],
    windshieldWasherPhotoUrl: "/uploads/test/washer.jpg",
    lightsPhotoUrl:            "/uploads/test/lights.jpg",
    batteryPhotoUrl:           "/uploads/test/battery.jpg",
    jackPhotoUrl:              "/uploads/test/jack.jpg",
    notes: "E2E smoke test",
  });
  console.log(`   status=${createRes.status} id=${createRes.data.id} status=${createRes.data.status}`);
  if (createRes.status !== 201) throw new Error(`Crear autorización esperaba 201, obtuve ${createRes.status} ${JSON.stringify(createRes.data)}`);
  const newId = createRes.data.id;

  // 5) Conductor ve su solicitud pendiente
  console.log(`\n5) Conductor GET /conductor-context (debería ver la nueva como Pendiente)`);
  const ctx2 = await api<Ctx>(cond.token, "GET", `/company/1/exit-authorizations/conductor-context`);
  const found = ctx2.data.authorizations.find((a) => a.id === newId);
  if (!found) throw new Error(`Conductor no ve la autorización ${newId}`);
  console.log(`   ✓ id=${found.id} status=${found.status}`);
  if (found.status !== "Pendiente") throw new Error(`Esperaba status=Pendiente, obtuve ${found.status}`);

  // 6) Supervisor lista pendientes
  console.log(`\n6) Supervisor GET /exit-authorizations?status=Pendiente`);
  const list = await api<{ id: string; status: string }[]>(supervisor.token, "GET", `/company/1/exit-authorizations?status=Pendiente`);
  console.log(`   status=${list.status} count=${Array.isArray(list.data) ? list.data.length : "n/a"}`);
  if (list.status !== 200) throw new Error("supervisor list no fue 200");
  if (!Array.isArray(list.data) || !list.data.find((a) => a.id === newId)) throw new Error("Supervisor no ve la solicitud pendiente");

  // 7) Supervisor aprueba
  console.log(`\n7) Supervisor POST /:id/approve`);
  const numId = newId.replace(/^exit-auth-/, "");
  const ap = await api<{ status: string }>(supervisor.token, "POST", `/company/1/exit-authorizations/${numId}/approve`, {});
  console.log(`   status=${ap.status} newStatus=${ap.data.status}`);
  if (ap.status !== 200) throw new Error(`Aprobar esperaba 200, obtuve ${ap.status} ${JSON.stringify(ap.data)}`);
  if (ap.data.status !== "Autorizada") throw new Error(`Esperaba Autorizada, obtuve ${ap.data.status}`);

  // 8) Conductor ve la solicitud aprobada
  console.log(`\n8) Conductor GET /conductor-context (debería ver Autorizada)`);
  const ctx3 = await api<Ctx>(cond.token, "GET", `/company/1/exit-authorizations/conductor-context`);
  const approved = ctx3.data.authorizations.find((a) => a.id === newId);
  if (!approved) throw new Error("Conductor no ve la autorización aprobada");
  console.log(`   ✓ id=${approved.id} status=${approved.status}`);
  if (approved.status !== "Autorizada") throw new Error(`Esperaba Autorizada, obtuve ${approved.status}`);

  // 9) Cleanup
  console.log(`\n9) Cleanup: borrar la solicitud aprobada`);
  const del = await api(supervisor.token, "DELETE", `/company/1/exit-authorizations/${numId}`);
  console.log(`   status=${del.status}`);

  console.log(`\nE2E smoke: PASS`);
  await pool.end();
}

main().catch((e) => { console.error(`\nE2E smoke: FAIL — ${e.message}`); process.exit(1); });
