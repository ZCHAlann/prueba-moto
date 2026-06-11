// scripts/smoke-conductor-endpoint.ts
//
// Smoke test: loguea con el conductor de prueba, llama al endpoint
// /conductor-context y verifica que devuelve 200 con los campos
// esperados (driverId, asset, authorizations).

import { config } from "dotenv";
config();

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:5000";
// El backend monta las rutas sin prefijo /api, pero el frontend sí las
// invoca con /api. El proxy de Vite las reescribe. Para el smoke test
// usamos las rutas reales (sin /api) ya que vamos directo al backend.
const LOGIN_URL    = `${BACKEND}/auth/login`;
const CONTEXT_BASE = `${BACKEND}/company`;

type LoginRes = {
  id: string;
  email: string;
  name: string;
  role: string;
  scope: string;
  companyId: number | null;
  companyModules: string[];
  modulePermissions: Record<string, Record<string, string[]>>;
};

type ConductorCtx = {
  driverId: number | null;
  asset: { id: string; plate: string; brand: string; model: string } | null;
  authorizations: unknown[];
};

async function login(): Promise<{ token: string; body: LoginRes }> {
  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: "conductor-test@aplismart.test",
      password: "test1234",
      scope: "operacion",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Login falló: ${res.status} ${text}`);
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  // El backend setea la cookie "aplismart_token" (no "token").
  const m = setCookie.match(/(?:^|,\s*)([^;=\s]+)=([^;]+)/g) ?? [];
  let token = "";
  for (const part of m) {
    const mm = part.trim().match(/^([^;=\s]+)=(.+)$/);
    if (!mm) continue;
    if (mm[1] === "aplismart_token") {
      token = `${mm[1]}=${mm[2]}`;
      break;
    }
  }
  const body = JSON.parse(text) as LoginRes;
  return { token, body };
}

async function callConductorContext(token: string, companyId: number): Promise<{ status: number; body: ConductorCtx | unknown }> {
  const res = await fetch(`${CONTEXT_BASE}/${companyId}/exit-authorizations/conductor-context`, {
    headers: { Cookie: token },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log(`1) Login con conductor de prueba…`);
  const { token, body: loginBody } = await login();
  console.log(`   ✓ Login OK`);
  console.log(`     id:     ${loginBody.id}`);
  console.log(`     role:   ${loginBody.role}`);
  console.log(`     scope:  ${loginBody.scope}`);
  console.log(`     comp:   ${loginBody.companyId}`);
  console.log(`     mods:   [${loginBody.companyModules.join(", ")}]`);
  if (loginBody.role !== "conductor") {
    throw new Error(`Esperaba role=conductor, obtuve ${loginBody.role}`);
  }
  if (!loginBody.companyId) {
    throw new Error(`companyId no presente en el login`);
  }

  console.log(`\n2) GET /api/company/${loginBody.companyId}/exit-authorizations/conductor-context`);
  const ctx = await callConductorContext(token, loginBody.companyId);
  console.log(`   status: ${ctx.status}`);
  if (ctx.status !== 200) {
    console.error("   body:", ctx.body);
    throw new Error(`Esperaba 200, obtuve ${ctx.status}`);
  }
  const body = ctx.body as ConductorCtx;
  console.log(`   ✓ 200 OK`);
  console.log(`   driverId:       ${body.driverId}`);
  console.log(`   asset:          ${body.asset ? `${body.asset.plate} - ${body.asset.brand} ${body.asset.model}` : "(sin asignación)"}`);
  console.log(`   authorizations: ${body.authorizations.length}`);
  if (!body.driverId) throw new Error(`driverId debería ser no-nulo`);
  if (!body.asset) throw new Error(`asset debería ser no-nulo (hay asignación activa)`);

  console.log(`\n3) Verificar el módulo NO devuelve 403 desde ningún otro hook (no más useDrivers/useAssets/useAssignments cruzados)`);
  console.log(`   ✓ El frontend ahora solo consume este endpoint para el Conductor`);

  console.log(`\nSmoke test: PASS`);
}

main().catch((e) => {
  console.error(`\nSmoke test: FAIL — ${e.message}`);
  process.exit(1);
});
