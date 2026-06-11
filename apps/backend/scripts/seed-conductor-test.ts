// scripts/seed-conductor-test.ts
//
// Crea (o actualiza) un usuario "Conductor de prueba" en la primera
// empresa que encuentre, con role=conductor, y le asigna un vehículo.
// La fila en company_drivers la crea automáticamente el
// driver-sync.service.ts (o el backfill, si ya corrió).
//
//   Email:    conductor-test@aplismart.test
//   Password: test1234
//
// Útil sólo para dev/smoke tests. No usar en producción.

import { config } from "dotenv";
config();

import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const companyIdRes = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM companies ORDER BY id LIMIT 1`,
  );
  if (!companyIdRes.rowCount) {
    throw new Error("No hay empresas en la base de datos. Crea una primero.");
  }
  const company = companyIdRes.rows[0]!;
  console.log(`Empresa: ${company.name} (id=${company.id})`);

  const passwordHash = await bcrypt.hash("test1234", 10);

  // 1) companyUser (el login de empresa va contra esta tabla)
  const existing = await pool.query<{ id: number; email: string }>(
    `SELECT id, email FROM company_users WHERE email = $1 AND company_id = $2`,
    ["conductor-test@aplismart.test", company.id],
  );

  let companyUserId: number;
  if (existing.rowCount) {
    companyUserId = existing.rows[0]!.id;
    await pool.query(
      `UPDATE company_users
       SET password_hash = $1, status = 'active', role = 'conductor',
           failed_login_attempts = 0, locked_until = NULL
       WHERE id = $2`,
      [passwordHash, companyUserId],
    );
    console.log(`companyUser ya existía, password/role reseteado (id=${companyUserId})`);
  } else {
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO company_users (company_id, email, username, password_hash, status, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', 'conductor', NOW(), NOW())
       RETURNING id`,
      [company.id, "conductor-test@aplismart.test", "conductor-test", passwordHash],
    );
    companyUserId = ins.rows[0]!.id;
    console.log(`companyUser creado (id=${companyUserId})`);
  }

  // 2) Driver row — replicamos la lógica del sync service sin importar
  //    el service (eso arrastra el cliente DB antes de dotenv.config).
  const driverRes = await pool.query<{ id: number }>(
    `SELECT id FROM company_drivers WHERE user_id = $1 AND company_id = $2`,
    [companyUserId, company.id],
  );
  let driverId: number;
  if (driverRes.rowCount) {
    driverId = driverRes.rows[0]!.id;
    console.log(`Driver ya existía (id=${driverId})`);
  } else {
    const name = "conductor-test".split(/\s+/);
    const firstName = name[0] ?? "Conductor";
    const lastName  = name.slice(1).join(" ") || "de Prueba";
    const code      = `COND-${companyUserId}`;
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO company_drivers (company_id, user_id, code, first_name, last_name, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Activo', NOW(), NOW()) RETURNING id`,
      [company.id, companyUserId, code, firstName, lastName],
    );
    driverId = ins.rows[0]!.id;
    console.log(`Driver creado (id=${driverId})`);
  }

  // 3) Asignación activa a un asset existente (o creamos uno)
  const today = new Date().toISOString().slice(0, 10);
  const assetRes = await pool.query<{ id: number; plate: string; brand: string; model: string; name: string }>(
    `SELECT id, plate, brand, model, name FROM company_assets WHERE company_id = $1 ORDER BY id LIMIT 1`,
    [company.id],
  );

  let assetId: number;
  let assetLabel: string;
  if (assetRes.rowCount) {
    const a = assetRes.rows[0]!;
    assetId = a.id;
    assetLabel = `${a.plate ?? "(s/placa)"} - ${a.brand ?? ""} ${a.model ?? ""}`.trim();
  } else {
    const ins = await pool.query<{ id: number; plate: string; brand: string; model: string; name: string }>(
      `INSERT INTO company_assets (company_id, code, name, plate, brand, model, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Toyota', 'Hilux', 'Operativo', NOW(), NOW())
       RETURNING id, plate, brand, model, name`,
      [company.id, `ASSET-${Date.now()}`, "Vehículo de prueba", "TEST-001"],
    );
    assetId = ins.rows[0]!.id;
    assetLabel = `${ins.rows[0]!.plate} - ${ins.rows[0]!.brand} ${ins.rows[0]!.model}`;
  }
  console.log(`Asset: ${assetLabel} (id=${assetId})`);

  // cerrar asignaciones previas
  await pool.query(
    `UPDATE company_assignments SET status = 'Cerrada', end_date = $1
     WHERE company_id = $2 AND driver_id = $3 AND status = 'Activa'`,
    [today, company.id, driverId],
  );

  // crear/actualizar asignación activa hoy
  const assignRes = await pool.query(
    `SELECT id FROM company_assignments
     WHERE company_id = $1 AND driver_id = $2 AND asset_id = $3
       AND start_date <= $4 AND (end_date IS NULL OR end_date >= $4)
       AND status = 'Activa'
     LIMIT 1`,
    [company.id, driverId, assetId, today],
  );
  if (!assignRes.rowCount) {
    await pool.query(
      `INSERT INTO company_assignments (company_id, asset_id, driver_id, start_date, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Activa', NOW(), NOW())`,
      [company.id, assetId, driverId, today],
    );
    console.log(`Asignación activa creada para hoy`);
  } else {
    console.log(`Asignación activa ya existía`);
  }

  // 4) Habilitar módulo autorizaciones en la empresa
  const enabled = await pool.query<{ enabled_modules: string[] }>(
    `SELECT enabled_modules FROM companies WHERE id = $1`,
    [company.id],
  );
  const mods = (enabled.rows[0]?.enabled_modules ?? []) as string[];
  if (!mods.includes("autorizaciones")) {
    mods.push("autorizaciones");
    await pool.query(
      `UPDATE companies SET enabled_modules = $1::text[] WHERE id = $2`,
      [mods, company.id],
    );
    console.log(`Módulo 'autorizaciones' agregado a la empresa`);
  } else {
    console.log(`Módulo 'autorizaciones' ya estaba habilitado`);
  }

  console.log(`\nListo. Credenciales:`);
  console.log(`  Email:    conductor-test@aplismart.test`);
  console.log(`  Password: test1234`);
  console.log(`  Company:  ${company.name} (id=${company.id})`);
  console.log(`  CompanyUserId: ${companyUserId}`);
  console.log(`  DriverId: ${driverId}`);
  console.log(`  AssetId:  ${assetId}`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
