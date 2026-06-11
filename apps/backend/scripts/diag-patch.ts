// scripts/diag-patch.ts
import { config } from "dotenv";
config();
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function login() {
  const res = await fetch("http://localhost:5000/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: "admin-driver-sync@aplismart.test",
      password: "test1234",
      scope: "operacion",
    }),
  });
  const set = res.headers.get("set-cookie") ?? "";
  const m = set.match(/(?:^|,\s*)([^;=\s]+)=([^;]+)/g) ?? [];
  for (const p of m) {
    const mm = p.trim().match(/^([^;=\s]+)=(.+)$/);
    if (mm?.[1] === "aplismart_token") return `${mm[1]}=${mm[2]}`;
  }
  throw new Error("no token");
}

(async () => {
  const token = await login();
  // Crear un user conductor ad-hoc para la prueba
  const ts = Date.now();
  const email = `diag-${ts}@aplismart.test`;
  const hash = await bcrypt.hash("test1234", 10);
  const r = await pool.query<{ id: number }>(
    `INSERT INTO company_users (company_id, email, username, password_hash, status, role, created_at, updated_at)
     VALUES (1, $1, $2, $3, 'active', 'conductor', NOW(), NOW()) RETURNING id`,
    [email, `diag-${ts}`, hash],
  );
  const u = { id: r.rows[0]!.id, email };
  console.log(`Created userId=${u.id} email=${u.email}`);
  console.log(`Patching userId=${u.id} email=${u.email}`);
  const res = await fetch(`http://localhost:5000/company/1/users/company-user-${u.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: token },
    body: JSON.stringify({ role: "supervisor" }),
  });
  console.log(`status=${res.status}`);
  console.log("body:", await res.text());
  await pool.end();
})();
