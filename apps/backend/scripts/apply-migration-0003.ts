// scripts/apply-migration-0003.ts
//
// Aplica la migración 0003_driver_user_unique_and_cascade.sql de
// manera idempotente (soporta re-ejecuciones).

import { config } from "dotenv";
config();
import { Pool } from "pg";
import * as fs from "node:fs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sqlText = fs.readFileSync("drizzle/0003_driver_user_unique_and_cascade.sql", "utf8");

async function main() {
  console.log("Aplicando migración 0003…");
  // Lo aplicamos statement por statement porque psql/Postgres no procesa
  // por sí solo los ; de un string con múltiples statements vía pg.
  // Split por `;` que termina stmt, y limpia comment-lines al inicio
  // de cada bloque. Mantiene los ALTERs juntos si hay varios en el mismo
  // stmt (Postgres los acepta en un solo query).
  const rawStmts = sqlText
    .split(/;\s*(?:\n|$)/)
    .map((s) => s
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim(),
    )
    .filter((s) => s.length > 0);

  const stmts = rawStmts;

  console.log(`Total stmts detectados: ${stmts.length}`);
  stmts.forEach((s, i) => console.log(`  [${i + 1}] starts: ${s.slice(0, 60).replace(/\n/g, "\\n")}…`));

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i]!;
    try {
      await pool.query(s);
      console.log(`  ✓ stmt ${i + 1}`);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; constraint?: string };
      console.log(`  ✗ stmt ${i + 1} error: ${err.code ?? "?"} ${err.message ?? "?"}`);
      const skip = ["42710", "42P16", "42P07", "42701"].includes(err.code ?? "")
        || /already exists/i.test(err.message ?? "")
        || /constraint .* already exists/i.test(err.message ?? "")
        || /duplicate key/i.test(err.message ?? "");
      if (skip) {
        console.log(`  · stmt ${i + 1} (skip: ${err.code ?? "already"})`);
        continue;
      }
      throw e;
    }
  }

  // Drizzle mark
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)`,
  );
  const c = await pool.query(
    `SELECT count(*)::int AS c FROM "__drizzle_migrations" WHERE hash = $1`,
    ["0003_driver_user_unique_and_cascade"],
  );
  if (c.rows[0]?.c === 0) {
    await pool.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      ["0003_driver_user_unique_and_cascade", Date.now()],
    );
    console.log("  ✓ Drizzle migrations table: 0003 marcada como aplicada");
  } else {
    console.log("  · Drizzle migrations table: 0003 ya estaba marcada");
  }

  console.log("\nMigración aplicada.");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
